// Firecrawl v2 screenshot client — the scan-website fallback capture leg.
//
// Why this exists: the fallback used to POST the v1 /scrape endpoint with a
// v1-style body carrying `screenshotOptions`. Firecrawl now rejects that:
//   400 BAD_REQUEST "Unrecognized key: screenshotOptions … /v1/scrape is
//   deprecated. Use /v2/scrape instead."   (live function logs, 2026-11-13)
// In v2 the screenshot options move INTO the format object:
//   formats: [{ type: 'screenshot', fullPage: true, viewport: { width, height } }]
// (https://docs.firecrawl.dev/migrate-to-v2 and the advanced scraping guide).
// Screenshot URLs returned by Firecrawl expire after 24 hours, so the caller
// still re-hosts the result into our own storage before storing it.
//
// This module is dependency-injected (fetcher / sleep / clock) so vitest can
// pin the body shape and the 429 behaviour without network or Deno.

import { CONSENT_EVIDENCE_READBACK_SCRIPT, CONSENT_REPORT_READBACK_SCRIPT } from "./consent-scan-probe.ts";

export const FIRECRAWL_V2_BASE = 'https://api.firecrawl.dev/v2';

/**
 * The v2 /scrape body for the fallback screenshot. Full page at desktop
 * size — parity with the Browserless desktop capture (the size bound is
 * enforced later, at re-host time, by JPEG-capping). waitFor matches the
 * settle budget of the Browserless path: JS-driven heroes can take well
 * over 3s to paint, and a frame snapped early is a solid-color blank.
 */
export function buildFirecrawlScreenshotBody(
  url: string,
  actions?: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    url,
    formats: [{ type: 'screenshot', fullPage: true, viewport: { width: 1920, height: 1080 } }],
    ...(actions && actions.length > 0 ? { actions } : {}),
    waitFor: 10000,
    timeout: 40000,
  };
}

/**
 * Firecrawl actions that dismiss the site's cookie-consent banner BEFORE the
 * screenshot is taken (demo surfaces must not show the banner — see
 * _shared/cookie-consent-dismissal.ts). The dismissal script installs an
 * in-page observer, so the trailing wait gives late banners time to appear
 * and be refused; Firecrawl captures the formats after actions complete.
 *
 * The final actions read the dismissal's evidence back so the scan
 * can RECORD whether a banner was present (see
 * _shared/consent-scan-probe.ts, Publish #49 follow-up + the witness
 * repair): the report read-back lands in the response's
 * actions.javascriptReturns when the tier returns action values, and
 * the combined evidence read-back adds the independent text/CMP
 * witness evaluated at read-back time. Both are silently absent on
 * tiers that discard action values.
 */
export function buildCookieConsentDismissalActions(script: string): Array<Record<string, unknown>> {
  return [
    { type: 'wait', milliseconds: 1200 },
    { type: 'executeJavascript', script },
    { type: 'wait', milliseconds: 2500 },
    { type: 'executeJavascript', script: CONSENT_REPORT_READBACK_SCRIPT },
    { type: 'executeJavascript', script: CONSENT_EVIDENCE_READBACK_SCRIPT },
  ];
}

/**
 * Extract Firecrawl's rate-limit hint. The 429 payload carries
 * `retry_after_seconds` (seen in live logs 2026-11-13); it may also sit on
 * a nested error object, or arrive as the standard Retry-After header.
 * Returns null when no usable hint is present.
 */
export function parseRetryAfterSeconds(input: {
  body?: unknown;
  retryAfterHeader?: string | null;
}): number | null {
  const body = input.body as Record<string, unknown> | null | undefined;
  const candidates: unknown[] = [
    body?.retry_after_seconds,
    body?.retryAfterSeconds,
    (body?.error as Record<string, unknown> | undefined)?.retry_after_seconds,
    (body?.error as Record<string, unknown> | undefined)?.retryAfterSeconds,
    input.retryAfterHeader,
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const seconds = Number(candidate);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pacing: Firecrawl's free tier rate-limits per minute, and a scan fires a
// content scrape and (on Browserless failure) a screenshot scrape at the
// same API. Stamping every Firecrawl call lets the screenshot leg hold off
// briefly instead of bursting straight into a 429.
// ---------------------------------------------------------------------------

export const FIRECRAWL_PACE_MS = 1500;

let lastFirecrawlRequestAt = 0;

/** Record that a Firecrawl request (any leg) was just made. */
export function markFirecrawlRequest(now: number = Date.now()): void {
  lastFirecrawlRequestAt = now;
}

/** Milliseconds the next Firecrawl request should wait to respect pacing. */
export function firecrawlPaceWaitMs(now: number = Date.now()): number {
  if (!lastFirecrawlRequestAt) return 0;
  return Math.max(0, lastFirecrawlRequestAt + FIRECRAWL_PACE_MS - now);
}

// ---------------------------------------------------------------------------
// The screenshot request itself: bounded 429 retry-with-backoff.
// ---------------------------------------------------------------------------

export const FIRECRAWL_429_MAX_RETRIES = 2;
export const FIRECRAWL_429_MAX_WAIT_MS = 20_000;

export interface FirecrawlScreenshotDeps {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (...args: unknown[]) => void;
  paceWaitMs?: () => number;
  /**
   * When set, the screenshot request first runs this cookie-consent
   * dismissal script in the page (see buildCookieConsentDismissalActions).
   * If Firecrawl rejects the actions key with a 400, the request is retried
   * once WITHOUT actions, so the fallback leg can never be broken by it.
   */
  consentDismissalScript?: string;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * POST /v2/scrape for a screenshot. On 429, waits the server-provided
 * retry_after_seconds (capped, so the caller's ~130s scan budget survives)
 * and retries at most FIRECRAWL_429_MAX_RETRIES times, logging each retry.
 * Any other non-OK status throws immediately, like the v1 helper did.
 * Returns the parsed response payload on success.
 */
export async function fetchFirecrawlScreenshot(
  url: string,
  apiKey: string,
  deps: FirecrawlScreenshotDeps = {},
): Promise<unknown> {
  const fetcher = deps.fetcher ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  const log = deps.log ?? ((...args: unknown[]) => console.log(...args));
  const paceWaitMs = deps.paceWaitMs ?? (() => firecrawlPaceWaitMs());

  let lastError: Error | null = null;
  let includeActions = Boolean(deps.consentDismissalScript);
  let attempt = 0;

  for (;;) {
    const pace = paceWaitMs();
    if (pace > 0) {
      log(`[Firecrawl v2] Pacing screenshot request for ${url}: waiting ${pace}ms since the previous Firecrawl call`);
      await sleep(pace);
    }
    markFirecrawlRequest();

    const response = await fetcher(`${FIRECRAWL_V2_BASE}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildFirecrawlScreenshotBody(
          url,
          includeActions ? buildCookieConsentDismissalActions(deps.consentDismissalScript!) : undefined,
        ),
      ),
    });

    const data: unknown = await response.json().catch(() => null);

    if (response.ok) return data;

    lastError = new Error(`Firecrawl v2 error [${response.status}]: ${JSON.stringify(data)}`);

    // The actions key is the only new surface here; if a plan/tier rejects
    // it (400, like the v1 screenshotOptions rejection), drop the actions
    // and retry the plain screenshot instead of losing the fallback leg.
    if (response.status === 400 && includeActions) {
      includeActions = false;
      log(`[Firecrawl v2] Actions rejected (400) for ${url}; retrying screenshot without consent-dismissal actions`);
      continue;
    }

    if (response.status !== 429 || attempt === FIRECRAWL_429_MAX_RETRIES) break;

    const retryAfterSeconds = parseRetryAfterSeconds({
      body: data,
      retryAfterHeader: response.headers?.get?.('retry-after') ?? null,
    });
    const fallbackSeconds = 5 * 2 ** attempt;
    const waitMs = Math.min(
      FIRECRAWL_429_MAX_WAIT_MS,
      Math.max(1000, (retryAfterSeconds ?? fallbackSeconds) * 1000),
    );
    log(
      `[Firecrawl v2] Rate limited (429) on screenshot scrape for ${url}; ` +
      `retry ${attempt + 1}/${FIRECRAWL_429_MAX_RETRIES} after ${waitMs}ms` +
      (retryAfterSeconds !== null ? ` (retry_after_seconds=${retryAfterSeconds})` : ' (no retry_after hint; exponential backoff)'),
    );
    await sleep(waitMs);
    attempt++;
  }

  throw lastError!;
}
