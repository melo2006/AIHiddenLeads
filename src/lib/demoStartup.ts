export const pendingScanProgress = (elapsedMs: number) => Math.min(88, 88 * (1 - Math.exp(-Math.max(0, elapsedMs) / 65000)));
/**
 * Decide whether to start the Browserbase live view for a demo whose iframe
 * embed is blocked.
 *
 * Cost rule: a screenshot that exists AND loads is enough — no live view.
 * But existence alone is not enough: stored screenshot links can be dead
 * (e.g. an expired signed URL returning 403). When the screenshot image has
 * FAILED to load, the live view is the only remaining way to show the
 * prospect's actual website, so it must start despite a URL being present.
 * `screenshotFailed` is driven by the screenshot <img>'s onError in
 * DemoSite.tsx — "pending" (not yet loaded, not yet failed) still skips.
 */
export const shouldStartRemotePreview = (
  needsFallback: boolean,
  hasScreenshot: boolean,
  screenshotFailed = false,
) => needsFallback && (!hasScreenshot || screenshotFailed);

/**
 * The demo is running on a captured copy of the site because the real site
 * blocks live embedding (check-iframe-embed verdict: blocked — NOT merely
 * unreachable) and what is on screen is the stored screenshot (loaded, or
 * at least not failed). Live-view sessions and inline iframes never earn
 * the protected-site note: in those cases the visitor sees the real site.
 */
export const isCapturedCopyPreview = (
  iframeFailureMode: "blocked" | "unreachable" | null,
  hasScreenshot: boolean,
  screenshotFailed: boolean,
  liveViewActive: boolean,
) =>
  iframeFailureMode === "blocked" &&
  hasScreenshot &&
  !screenshotFailed &&
  !liveViewActive;

/**
 * Whether the full-screen "building your demo" curtain stays up.
 *
 * Normally the curtain also waits for Aspen's first voice session to be
 * prepared (assistantReady) so the reveal is complete. A PINNED example
 * (fastReveal) must not wait for that: its site preview is already real
 * the moment the stored screenshot/iframe paints, and the widget carries
 * its own visible "Connecting…" state — holding the scanning curtain
 * until the voice session warms up is what made pre-scanned examples
 * look stuck at the progress asymptote (2026-11-13, Ron's phone test of
 * the Saperstein/Steinberg pinned links).
 */
export const shouldHoldLoadingOverlay = (
  isPreviewLoading: boolean,
  hasAnyPreview: boolean,
  assistantReady: boolean,
  fastReveal: boolean,
) => isPreviewLoading || (hasAnyPreview && !assistantReady && !fastReveal);

/**
 * A stored screenshot that neither loads nor errors (stalled connection,
 * hung CDN edge) must not hold the demo curtain forever. After this
 * budget the screenshot is treated as failed, which releases the
 * Browserbase live view and, failing that, the scan-content preview —
 * the visitor always lands on content, never on an endless curtain or
 * a black area.
 */
export const SCREENSHOT_LOAD_TIMEOUT_MS = 12000;

/**
 * Same principle for the Browserbase live view: a session can be
 * created successfully while its iframe then stalls forever (heavy
 * third-party page, blocked frame). Without a budget, the demo's
 * preview-loading state waited on that iframe indefinitely — the
 * other half of the Publish #42 pinned-demo hang. After this budget
 * the live view counts as failed and the demo settles on the stored
 * screenshot or the scan-content preview.
 */
export const LIVE_VIEW_LOAD_TIMEOUT_MS = 15000;
