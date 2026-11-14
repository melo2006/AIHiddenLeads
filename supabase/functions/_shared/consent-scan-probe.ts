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
 *     scrape actions; trailing read-back actions return the live
 *     report in the response's javascriptReturns, extracted here.
 *
 * Everything in this module is best-effort by design: any failure
 * yields null (unrecorded), and scan-website writes the flags in a
 * separate warn-only update, so recording can never break a scan.
 *
 * WITNESS REPAIR (2026-11-14, post-#50): the first backfill recorded
 * seen=false for ALL 14 pinned leads — including Martinez, whose
 * CookieYes banner is real. Diagnosis (see
 * consent-witness-fix-report-2026-11-14.md): "seen" was defined
 * EXCLUSIVELY as the dismissal script's container-gated report,
 * observed over a short window. The dismissal was built to CLICK
 * safely, not to WITNESS: any banner that renders after the window,
 * renders only on scroll, or sits in markup its container heuristics
 * don't classify is recorded as a durable FALSE. The witness is now
 * independent evidence gathered alongside the report (visible consent
 * phrases / exact consent-action button texts / CMP fingerprints in
 * the rendered DOM), the probe unwraps and SHAPE-GUARDS every payload
 * before reducing it (a non-report object used to reduce to FALSE),
 * and scan-website merges writes sticky-true so a later thin witness
 * can never erase a recorded TRUE.
 */

import {
  buildCookieConsentDismissalScript,
  CONSENT_HTML_SIGNATURES,
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
  /**
   * How `seen` was established, for logs/audit: "report" (the
   * dismissal script's own container-gated report) or the text
   * witness's channel ("phrase" | "button" | "cmp"). Null when the
   * page was witnessed with no banner.
   */
  witnessVia: "report" | ConsentTextWitnessVia | null;
}

/**
 * Shape guard for a dismissal report. The Firecrawl extractor has
 * always required this shape; the reducer and the Browserless probe
 * parser originally did NOT — any JSON object (an envelope, an error
 * body, `{}`) was reduced to a durable seen=false. A value is only a
 * report when it carries the report's own fields with plausible
 * types.
 */
export function looksLikeDismissalReport(
  value: unknown,
): value is CookieConsentDismissalReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    ("status" in record || "containers" in record) &&
    ("clicked" in record || "attempts" in record)
  );
}

/**
 * Reduce a dismissal report to the durable flags. "Seen" is witnessed
 * two ways: the script clicked something (a validated consent control
 * existed), or its attempts found at least one consent container —
 * including a banner it could not dismiss (e.g. Customize-only),
 * which is still a banner the covered view must handle. A report
 * that found nothing is a witnessed FALSE (the page was seen and
 * carried no banner). No report at all — OR a value that is not
 * shaped like a report — → null (unrecorded), never a false.
 */
export function consentScanFlagsFromReport(
  report: CookieConsentDismissalReport | null | undefined,
): ConsentBannerScanFlags | null {
  if (!looksLikeDismissalReport(report)) return null;
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
    witnessVia: seen ? "report" : null,
  };
}

// ---------------------------------------------------------------------------
// Independent text/CMP witness.
//
// The dismissal report answers "could the clicker act, inside the
// containers it recognizes?" The WITNESS answers the prior question —
// "is a consent banner on this page at all?" — with evidence that does
// not depend on the dismissal's container classification:
//   phrase — a visible element carries a consent-banner phrase
//            ("We value your privacy", "reject non-essential", …);
//   button — a visible clickable's exact text is a consent action
//            ("REJECT NON-ESSENTIAL", "ACCEPT ALL", …);
//   cmp    — the rendered DOM carries a consent-framework fingerprint
//            (the #49 CONSENT_HTML_SIGNATURES: CMP script hosts, SDK
//            ids, plugin slugs — deliberately no generic words, so a
//            footer "Cookie Policy" link never trips it). A CMP that
//            banners every fresh browser is present even when its
//            banner div renders late or not at all in the capture
//            browser; for demo routing that is exactly the TRUE the
//            record needs (the covered view's own dismissal handles
//            whatever renders there, and a site that shows nothing
//            simply displays through the covered view).
// ---------------------------------------------------------------------------

export type ConsentTextWitnessVia = "phrase" | "button" | "cmp";

export interface ConsentTextWitness {
  seen: boolean;
  via: ConsentTextWitnessVia | null;
  /** The phrase / button text / signature that matched (audit). */
  detail: string | null;
}

export function looksLikeConsentTextWitness(value: unknown): value is ConsentTextWitness {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.seen === "boolean" && "via" in record;
}

/**
 * The page-side witness. ONE self-contained source string, same
 * pattern as the dismissal: the probe evaluates it in the capture
 * browser, the Firecrawl read-back returns it from the fallback
 * browser, and the tests materialize the exact shipped string
 * against jsdom fixtures.
 */
export const CONSENT_TEXT_WITNESS_SOURCE = `
function consentTextWitnessMain(doc, signatures) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || !root.documentElement) return { seen: false, via: null, detail: null };
  var win = root.defaultView || (typeof window !== 'undefined' ? window : null);
  var PHRASES = [
    'we value your privacy', 'reject non-essential', 'we use cookies',
    'this site uses cookies', 'this website uses cookies',
    'we use cookies and similar', 'your privacy choices', 'cookie consent'
  ];
  var BUTTON_TEXTS = [
    'reject all', 'accept all', 'reject non-essential', 'reject non essential',
    'allow all', 'deny all', 'decline all', 'accept cookies', 'reject cookies',
    'accept all cookies', 'only essential', 'essential only',
    'continue without accepting', 'do not sell or share'
  ];
  function norm(s) {
    return String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  }
  function isShown(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    if (win && win.getComputedStyle) {
      try {
        var cs = win.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      } catch (e) { /* ignore */ }
    }
    // Geometry check only where real layout exists (jsdom reports 0 everywhere).
    if (root.documentElement && root.documentElement.clientWidth > 0 && el.getClientRects) {
      if (el.getClientRects().length === 0) return false;
    }
    return true;
  }
  var i, j, el, text;
  // 1) Consent phrases in any visible element's text. Ancestors match
  //    too (their textContent includes the banner's), which is fine:
  //    a match anywhere means the phrase is rendered on the page.
  try {
    var all = root.querySelectorAll('body *');
    for (i = 0; i < all.length && i < 6000; i++) {
      el = all[i];
      if (!isShown(el)) continue;
      text = norm(el.textContent).slice(0, 2000);
      if (!text) continue;
      for (j = 0; j < PHRASES.length; j++) {
        if (text.indexOf(PHRASES[j]) !== -1) return { seen: true, via: 'phrase', detail: PHRASES[j] };
      }
    }
  } catch (e) { /* fall through to the other channels */ }
  // 2) Exact consent-action labels on visible clickables.
  try {
    var clickables = root.querySelectorAll('button, a[href], [role="button"], input[type="button"], input[type="submit"]');
    for (i = 0; i < clickables.length; i++) {
      el = clickables[i];
      if (el.disabled) continue;
      if (!isShown(el)) continue;
      text = norm(el.innerText || el.textContent || el.value || '');
      if (BUTTON_TEXTS.indexOf(text) !== -1) return { seen: true, via: 'button', detail: text };
    }
  } catch (e) { /* fall through */ }
  // 3) CMP fingerprints in the rendered DOM (script hosts, SDK ids,
  //    plugin slugs — never generic words).
  try {
    var sigs = Array.isArray(signatures) ? signatures : [];
    var html = String(root.documentElement.outerHTML || '').toLowerCase();
    for (i = 0; i < sigs.length; i++) {
      if (sigs[i] && html.indexOf(String(sigs[i]).toLowerCase()) !== -1) {
        return { seen: true, via: 'cmp', detail: String(sigs[i]) };
      }
    }
  } catch (e) { /* no evidence */ }
  return { seen: false, via: null, detail: null };
}
`;

/** Wrap the witness source in a runnable script for in-page evaluation. */
export function buildConsentTextWitnessScript(
  signatures: readonly string[] = CONSENT_HTML_SIGNATURES,
): string {
  return (
    CONSENT_TEXT_WITNESS_SOURCE +
    "\n;consentTextWitnessMain(document, " +
    JSON.stringify(signatures) +
    ");"
  );
}

/** Materialize the page-side witness for tests (exact shipped string). */
export function loadConsentTextWitnessMain(): (
  root: unknown,
  signatures?: readonly string[],
) => ConsentTextWitness {
  const factory = new Function(
    `${CONSENT_TEXT_WITNESS_SOURCE}\nreturn consentTextWitnessMain;`,
  ) as () => (root: unknown, signatures?: readonly string[]) => ConsentTextWitness;
  const main = factory();
  return (root, signatures = CONSENT_HTML_SIGNATURES) => main(root, signatures);
}

export interface ConsentScanEvidence {
  report?: CookieConsentDismissalReport | null;
  textWitness?: ConsentTextWitness | null;
}

/**
 * Reduce the combined evidence (dismissal report + independent
 * witness) to the durable flags. The report stays primary for the
 * dismissed/clicked facts; the witness can only ADD a seen — a banner
 * the clicker could not classify is still a banner. A witness with
 * seen=false and no report is a witnessed FALSE (the page was
 * examined and carried no banner evidence). No usable evidence at
 * all → null (unrecorded).
 */
export function consentScanFlagsFromEvidence(
  evidence: ConsentScanEvidence | null | undefined,
): ConsentBannerScanFlags | null {
  if (!evidence || typeof evidence !== "object") return null;
  const fromReport = consentScanFlagsFromReport(evidence.report ?? null);
  const witness = looksLikeConsentTextWitness(evidence.textWitness) ? evidence.textWitness : null;
  if (fromReport) {
    if (witness && witness.seen && !fromReport.seen) {
      return { ...fromReport, seen: true, witnessVia: witness.via };
    }
    return fromReport;
  }
  if (witness) {
    return {
      seen: witness.seen,
      dismissed: false,
      clicked: null,
      status: null,
      witnessVia: witness.seen ? witness.via : null,
    };
  }
  return null;
}

/**
 * Sticky-true merge for the scan write path: once a scan has recorded
 * a banner (seen/dismissed TRUE), a later scan whose witness came
 * back thin (a FALSE from a capture where the banner didn't render)
 * must not erase it — the banner is a property of the SITE, and one
 * positive witness outweighs any number of later non-observations.
 * Returns null when there is nothing new to write (incoming null).
 */
export function mergeConsentBannerFlags(
  existing: { seen?: boolean | null; dismissed?: boolean | null } | null | undefined,
  incoming: ConsentBannerScanFlags | null | undefined,
): ConsentBannerScanFlags | null {
  if (!incoming) return null;
  if (!existing) return incoming;
  return {
    ...incoming,
    seen: existing.seen === true || incoming.seen,
    dismissed: existing.dismissed === true || incoming.dismissed,
  };
}

// ---------------------------------------------------------------------------
// Channel 1: Browserless /function probe.
// ---------------------------------------------------------------------------

/** Observe budget for the probe's dismissal script, in ms. */
export const CONSENT_PROBE_OBSERVE_MS = 12000;

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
 * Flow: navigate → inject the dismissal script → poll its live report
 * (with a mid-window scroll nudge: banners that render lazily, on
 * scroll or after a consent-config fetch get their chance to appear,
 * as they do in the full-page capture whose stitch scrolls the page)
 * → final evidence read: a FRESH report read plus the independent
 * text/CMP witness, so what the page shows at the end of the window
 * counts even when the dismissal's container heuristics missed it.
 *
 * Returns data = `{ report, textWitness, finalUrl, pageTextSample }`
 * (any field may be null); the caller shape-guards every field before
 * reducing it, and uses `pageTextSample` to refuse bot-walled or
 * empty pages (never witnessed → unrecorded).
 */
export function buildBrowserlessConsentProbeCode(
  url: string,
  dismissalScript: string,
  observeMs: number = CONSENT_PROBE_OBSERVE_MS,
  witnessScript: string = buildConsentTextWitnessScript(),
): string {
  return `export default async function ({ page }) {
  const targetUrl = ${JSON.stringify(url)};
  const script = ${JSON.stringify(dismissalScript)};
  const witnessScript = ${JSON.stringify(witnessScript)};
  try {
    await page.setViewport({ width: 1920, height: 1080 });
  } catch (e) { /* default viewport is acceptable */ }
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) { /* a timed-out goto can still leave a rendered page */ }
  try {
    await page.evaluate(script);
  } catch (e) { /* CSP/realm failures leave report null = unrecorded */ }
  const readReport = async () => {
    try {
      return await page.evaluate(() => (window.__aihlCookieDismissal && window.__aihlCookieDismissal.report) || null);
    } catch (e) { return null; }
  };
  const deadline = Date.now() + ${JSON.stringify(observeMs + 500)};
  let report = null;
  let nudged = false;
  while (Date.now() < deadline) {
    report = await readReport();
    if (report && report.clicked) break;
    if (!nudged && Date.now() > deadline - ${JSON.stringify(Math.floor((observeMs + 500) / 2))}) {
      nudged = true;
      try {
        await page.evaluate(() => {
          window.scrollTo(0, document.body ? document.body.scrollHeight : 0);
        });
        await new Promise((resolve) => setTimeout(resolve, 700));
        await page.evaluate(() => window.scrollTo(0, 0));
      } catch (e) { /* a page that refuses to scroll still gets witnessed */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  // Final reads: the freshest report plus the independent witness.
  report = (await readReport()) || report;
  let textWitness = null;
  try {
    textWitness = await page.evaluate(witnessScript);
  } catch (e) { textWitness = null; }
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
  const data = { report, textWitness, finalUrl, pageTextSample };
  return { data, type: 'application/json' };
}`;
}

export interface BrowserlessConsentProbeDeps {
  fetcher?: typeof fetch;
  /** Override the dismissal script (tests pin the default build). */
  dismissalScript?: string;
  /** Override the text-witness script (tests pin the default build). */
  witnessScript?: string;
  observeMs?: number;
  log?: (...args: unknown[]) => void;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Run the consent probe through Browserless /function. Returns the
 * durable flags, or null when the probe could not witness the page
 * (no response, HTTP error, malformed payload, an empty page, or a
 * bot wall) — null means UNRECORDED, never "no banner".
 *
 * Payload handling is deliberately paranoid (the original version
 * reduced ANY object to seen=false): the /function contract returns
 * the function's `data` as the body, but the parser also unwraps a
 * `{ data }` envelope, and a field only counts when it is SHAPED
 * like what it claims to be (looksLikeDismissalReport /
 * looksLikeConsentTextWitness) — anything else is unrecorded.
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
    const witnessScript = deps.witnessScript ?? buildConsentTextWitnessScript();
    const response = await fetcher(`https://production-sfo.browserless.io/function?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: buildBrowserlessConsentProbeCode(
          url,
          dismissalScript,
          deps.observeMs ?? CONSENT_PROBE_OBSERVE_MS,
          witnessScript,
        ),
        context: {},
      }),
    });
    if (!response.ok) {
      log("[ConsentProbe] Browserless /function failed:", response.status);
      return null;
    }
    const payload: unknown = await response.json().catch(() => null);
    const envelope = asRecord(payload);
    if (!envelope) return null;
    const data = asRecord(envelope.data) ?? envelope;
    const reportCandidate = [data.report, data, envelope.report, envelope].find((c) =>
      looksLikeDismissalReport(c),
    ) as CookieConsentDismissalReport | undefined;
    const witnessCandidate = [data.textWitness, envelope.textWitness].find((c) =>
      looksLikeConsentTextWitness(c),
    ) as ConsentTextWitness | undefined;
    const pageTextSample = [data.pageTextSample, envelope.pageTextSample].find(
      (c): c is string => typeof c === "string",
    );
    if (looksLikeBotWall(pageTextSample)) {
      log("[ConsentProbe] Capture browser hit a bot wall for", url, "— consent state unrecorded");
      return null;
    }
    const flags = consentScanFlagsFromEvidence({
      report: reportCandidate ?? null,
      textWitness: witnessCandidate ?? null,
    });
    if (!flags) return null;
    // A probe that reached no readable page (empty title + body text —
    // a connection-error or blank page) witnessed nothing, whatever
    // the reductions above produced from its empty DOM.
    if (!pageTextSample || pageTextSample.trim() === "") {
      log("[ConsentProbe] Probe read an empty page for", url, "— consent state unrecorded");
      return null;
    }
    if (flags.witnessVia && flags.witnessVia !== "report") {
      log("[ConsentProbe] Banner witnessed via", flags.witnessVia, "for", url);
    }
    return flags;
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

/**
 * Firecrawl executeJavascript action that reads back the COMBINED
 * consent evidence — the dismissal's live report AND the independent
 * text/CMP witness, evaluated at read-back time (so a banner that
 * rendered after the dismissal stopped watching still witnesses).
 * Returns `{ report, textWitness }`; both fields may be null.
 */
export const CONSENT_EVIDENCE_READBACK_SCRIPT =
  "(() => { try { " +
  CONSENT_TEXT_WITNESS_SOURCE +
  " const report = (window.__aihlCookieDismissal && window.__aihlCookieDismissal.report) || null;" +
  " let textWitness = null;" +
  " try { textWitness = consentTextWitnessMain(document, " +
  JSON.stringify(CONSENT_HTML_SIGNATURES) +
  "); } catch (e) { textWitness = null; }" +
  " return { report, textWitness }; } catch (e) { return null; } })()";

/**
 * Unwrap one javascriptReturns entry (Firecrawl returns raw values or
 * `{ value }` wrappers depending on tier) to the values it may carry:
 * a dismissal report, a text witness, or the combined evidence
 * object. Anything unrecognized contributes nothing.
 */
function evidenceFromFirecrawlEntry(entry: unknown, into: ConsentScanEvidence): void {
  const value = entry && typeof entry === "object" && "value" in (entry as Record<string, unknown>)
    ? (entry as Record<string, unknown>).value
    : entry;
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  if (looksLikeDismissalReport(record)) {
    into.report = into.report ?? record;
    return;
  }
  if (looksLikeConsentTextWitness(record)) {
    into.textWitness = into.textWitness ?? record;
    return;
  }
  // Combined evidence object { report, textWitness }.
  if ("report" in record || "textWitness" in record) {
    if (looksLikeDismissalReport(record.report)) into.report = into.report ?? record.report;
    if (looksLikeConsentTextWitness(record.textWitness)) {
      into.textWitness = into.textWitness ?? record.textWitness;
    }
  }
}

/**
 * Find the consent evidence in a Firecrawl scrape payload. v2 returns
 * action results under data.actions.javascriptReturns; entries may be
 * raw values or `{ value }` wrappers. Walks the same unwrap shapes
 * scan-website uses for the payload itself. Returns null when the
 * payload carries NO usable evidence (tier discarded action values,
 * actions absent) — an absent read-back is UNRECORDED, never a false.
 */
export function extractConsentEvidenceFromFirecrawlPayload(
  payload: unknown,
): ConsentScanEvidence | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const levels: unknown[] = [
    root,
    (root.data as Record<string, unknown> | undefined) ?? null,
    ((root.data as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined) ?? null,
  ];
  const evidence: ConsentScanEvidence = {};
  for (const level of levels) {
    if (!level || typeof level !== "object") continue;
    const actions = (level as Record<string, unknown>).actions as Record<string, unknown> | undefined;
    const returns = actions?.javascriptReturns;
    if (!Array.isArray(returns)) continue;
    for (const entry of returns) evidenceFromFirecrawlEntry(entry, evidence);
  }
  return evidence.report || evidence.textWitness ? evidence : null;
}

/**
 * Find the dismissal report in a Firecrawl scrape payload (the
 * report-only view of extractConsentEvidenceFromFirecrawlPayload,
 * kept for the original callers/tests).
 */
export function extractConsentReportFromFirecrawlPayload(
  payload: unknown,
): CookieConsentDismissalReport | null {
  return extractConsentEvidenceFromFirecrawlPayload(payload)?.report ?? null;
}
