/**
 * Consent-banner SCAN RECORDING (Publish #49 follow-up, 2026-11-14).
 *
 * Publish #49 tried to detect banner sites by fingerprinting the
 * homepage HTML inside check-iframe-embed — a live probe from the
 * edge function's datacenter egress. That is structurally unreliable
 * for exactly the sites that matter: martinezrealtorsfl.com bot-walls
 * datacenter traffic, so the probe answered `unreachable`, detection
 * never ran (it only ran on embeddable verdicts), and the visitor's
 * browser — which CAN load the site — got the raw iframe with the
 * banner in the middle (verified live on Ron's exact link).
 *
 * Detection therefore moves to where the page is already seen: the
 * scan-website CAPTURE pipeline (Browserless / Firecrawl), which
 * renders these pages through real browsers that get past the walls
 * plain fetches cannot. The #48 dismissal script already runs inside
 * those captures; this module turns its in-page report into a durable
 * pair of flags on the leads row:
 *
 *   consent_banner_seen      — a consent banner was present at scan
 *   consent_banner_dismissed — the capture dismissed it (Reject
 *                              preferred, Accept only when no refusal
 *                              existed — the dismissal script's rules)
 *
 * DemoSite routes on the stored flag (a TRUE flag outranks the live
 * probe entirely; see resolveConsentCoveredRoute in demoStartup.ts).
 *
 * Recording channels, in priority order:
 *  1. A dedicated Browserless /function probe: navigates at the
 *     desktop capture's viewport class (1920×1080 — the class that
 *     demonstrably gets past the walls that stop small viewports),
 *     injects the dismissal script, and polls its live report until
 *     it clicks or the observe budget ends. A bot-wall interstitial
 *     ("Just a moment…", "Verify you are human") is NOT evidence of
 *     "no banner": the probe reports UNKNOWN (null) there, never a
 *     durable false.
 *  2. The Firecrawl screenshot fallback: the dismissal runs as
 *     scrape actions; a trailing read-back action returns the live
 *     report in the response's javascriptReturns, extracted here.
 *
 * Everything in this module is best-effort by design: any failure
 * yields null (unrecorded), and scan-website writes the flags in a
 * separate warn-only update, so recording can never break a scan.
 */

import {
  buildCookieConsentDismissalScript,
  type CookieConsentDismissalReport,
} from "./cookie-consent-dismissal.ts";

export interface ConsentBannerScanFlags {
  /** A consent banner/container was present on the scanned page. */
  seen: boolean;
  /** The capture dismissed it (the dismissal script clicked). */
  dismissed: boolean;
  /** Which control was clicked, for logs/audit. */
  clicked: "reject" | "accept" | null;
  /** The dismissal report's terminal status, for logs/audit. */
  status: CookieConsentDismissalReport["status"] | null;
}

/**
 * Reduce a dismissal report to the durable flags. "Seen" is witnessed
 * two ways: the script clicked something (a validated consent control
 * existed), or its attempts found at least one consent container —
 * including a banner it could not dismiss (e.g. Customize-only),
 * which is still a banner the covered view must handle. A report
 * that found nothing is a witnessed FALSE (the page was seen and
 * carried no banner). No report at all → null (unrecorded).
 */
export function consentScanFlagsFromReport(
  report: CookieConsentDismissalReport | null | undefined,
): ConsentBannerScanFlags | null {
  if (!report || typeof report !== "object") return null;
  const clicked = report.clicked === "reject" || report.clicked === "accept" ? report.clicked : null;
  const containers = typeof report.containers === "number" && Number.isFinite(report.containers)
    ? report.containers
    : 0;
  const seen = clicked !== null || containers > 0;
  return {
    seen,
    dismissed: clicked !== null,
    clicked,
    status: typeof report.status === "string" ? report.status : null,
  };
}

// ---------------------------------------------------------------------------
// Channel 1: Browserless /function probe.
// ---------------------------------------------------------------------------

/** Observe budget for the probe's dismissal script, in ms. */
export const CONSENT_PROBE_OBSERVE_MS = 9000;

/**
 * Bot-wall interstitial titles/phrases. A capture browser that lands
 * on one of these never saw the real page, so its "no banner found"
 * would be a false negative durable-ized — the exact failure this
 * recording exists to replace. The probe reports unknown instead.
 */
export const BOT_WALL_MARKERS: readonly string[] = [
  "just a moment",
  "performing security verification",
  "verify you are human",
  "attention required",
  "checking your browser",
  "are you a robot",
];

export function looksLikeBotWall(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BOT_WALL_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * The Browserless /function code for the consent probe. Follows the
 * established /function shape in scan-website (shrinkScreenshotViaBrowser):
 * values are baked in with JSON.stringify, the return is
 * `{ data, type: 'application/json' }`, and every step is failure-soft
 * so a hostile page can never throw the probe away.
 *
 * Returns data = the dismissal report, augmented with `finalUrl` and
 * a `pageTextSample` (title + first body text) so the caller can
 * recognize a bot wall and refuse to record a false negative.
 */
export function buildBrowserlessConsentProbeCode(
  url: string,
  dismissalScript: string,
  observeMs: number = CONSENT_PROBE_OBSERVE_MS,
): string {
  return `export default async function ({ page }) {
  const targetUrl = ${JSON.stringify(url)};
  const script = ${JSON.stringify(dismissalScript)};
  try {
    await page.setViewport({ width: 1920, height: 1080 });
  } catch (e) { /* default viewport is acceptable */ }
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) { /* a timed-out goto can still leave a rendered page */ }
  try {
    await page.evaluate(script);
  } catch (e) { /* CSP/realm failures leave report null = unrecorded */ }
  const deadline = Date.now() + ${JSON.stringify(observeMs + 500)};
  let report = null;
  while (Date.now() < deadline) {
    try {
      report = await page.evaluate(() => (window.__aihlCookieDismissal && window.__aihlCookieDismissal.report) || null);
    } catch (e) { report = null; }
    if (report && report.clicked) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  let pageTextSample = '';
  try {
    pageTextSample = await page.evaluate(() => {
      const title = document.title || '';
      const body = document.body ? String(document.body.innerText || '').slice(0, 300) : '';
      return title + ' ' + body;
    });
  } catch (e) { pageTextSample = ''; }
  let finalUrl = targetUrl;
  try { finalUrl = page.url() || targetUrl; } catch (e) { /* keep target */ }
  const data = report ? Object.assign({}, report, { finalUrl, pageTextSample }) : null;
  return { data, type: 'application/json' };
}`;
}

export interface BrowserlessConsentProbeDeps {
  fetcher?: typeof fetch;
  /** Override the dismissal script (tests pin the default build). */
  dismissalScript?: string;
  observeMs?: number;
  log?: (...args: unknown[]) => void;
}

/**
 * Run the consent probe through Browserless /function. Returns the
 * durable flags, or null when the probe could not witness the page
 * (no response, HTTP error, malformed payload, or a bot wall) — null
 * means UNRECORDED, never "no banner".
 */
export async function probeConsentBannerViaBrowserless(
  url: string,
  apiKey: string,
  deps: BrowserlessConsentProbeDeps = {},
): Promise<ConsentBannerScanFlags | null> {
  const fetcher = deps.fetcher ?? fetch;
  const log = deps.log ?? ((...args: unknown[]) => console.log(...args));
  try {
    const dismissalScript = deps.dismissalScript ??
      buildCookieConsentDismissalScript({ observeMs: deps.observeMs ?? CONSENT_PROBE_OBSERVE_MS });
    const response = await fetcher(`https://production-sfo.browserless.io/function?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: buildBrowserlessConsentProbeCode(url, dismissalScript, deps.observeMs ?? CONSENT_PROBE_OBSERVE_MS),
        context: {},
      }),
    });
    if (!response.ok) {
      log("[ConsentProbe] Browserless /function failed:", response.status);
      return null;
    }
    const payload: unknown = await response.json().catch(() => null);
    const report = (payload && typeof payload === "object"
      ? ((payload as Record<string, unknown>).report ?? payload)
      : null) as (CookieConsentDismissalReport & { pageTextSample?: string }) | null;
    if (!report || typeof report !== "object") return null;
    if (looksLikeBotWall(report.pageTextSample)) {
      log("[ConsentProbe] Capture browser hit a bot wall for", url, "— consent state unrecorded");
      return null;
    }
    return consentScanFlagsFromReport(report);
  } catch (error) {
    log("[ConsentProbe] Browserless probe error:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Channel 2: Firecrawl javascriptReturns read-back.
// ---------------------------------------------------------------------------

/**
 * Firecrawl executeJavascript action that reads back the dismissal
 * script's LIVE report after the dismissal actions + their trailing
 * wait have run. Written as an IIFE expression so its value is the
 * script's completion value under eval-style capture; strictly
 * best-effort — a tier that discards action return values simply
 * yields no report and the Browserless probe remains the recorder.
 */
export const CONSENT_REPORT_READBACK_SCRIPT =
  "(() => { try { return (window.__aihlCookieDismissal && window.__aihlCookieDismissal.report) || null; } catch (e) { return null; } })()";

const looksLikeDismissalReport = (value: unknown): value is CookieConsentDismissalReport => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    ("status" in record || "containers" in record) &&
    ("clicked" in record || "attempts" in record)
  );
};

/**
 * Find the dismissal report in a Firecrawl scrape payload. v2 returns
 * action results under data.actions.javascriptReturns; entries may be
 * raw values or `{ value }` wrappers. Walks the same unwrap shapes
 * scan-website uses for the payload itself and returns the first
 * entry that actually looks like a dismissal report.
 */
export function extractConsentReportFromFirecrawlPayload(
  payload: unknown,
): CookieConsentDismissalReport | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const levels: unknown[] = [
    root,
    (root.data as Record<string, unknown> | undefined) ?? null,
    ((root.data as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined) ?? null,
  ];
  for (const level of levels) {
    if (!level || typeof level !== "object") continue;
    const actions = (level as Record<string, unknown>).actions as Record<string, unknown> | undefined;
    const returns = actions?.javascriptReturns;
    if (!Array.isArray(returns)) continue;
    for (const entry of returns) {
      const value = entry && typeof entry === "object" && "value" in (entry as Record<string, unknown>)
        ? (entry as Record<string, unknown>).value
        : entry;
      if (looksLikeDismissalReport(value)) return value;
    }
  }
  return null;
}
