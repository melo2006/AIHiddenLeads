export const pendingScanProgress = (elapsedMs: number) => Math.min(88, 88 * (1 - Math.exp(-Math.max(0, elapsedMs) / 65000)));

/**
 * Whether DemoSite holds the full-screen loading state because the
 * lead data on screen belongs to a DIFFERENT homepage than the one
 * the visitor asked for. The guard exists for ordinary fresh demos:
 * cached or merged data for site A must never be presented as the
 * demo for site B, so the page waits until data for the requested
 * homepage arrives.
 *
 * PINNED EXAMPLES ARE EXEMPT (Publish #44 regression round 3
 * follow-up, 2026-11-14). A pinned demo is identified by its leadId,
 * and the stored record IS that example's site by construction, so a
 * homepage mismatch can never mean "wrong site" for it — it means
 * the entry link and the record name the site by different hosts.
 * That is a real, permanent state for the Frank examples: their
 * records store the pinned map's canonical domains (the businesses'
 * primary domains, michaelmartinezrealtor.com /
 * paulsapersteinhomes.com — the records must stay canonical because
 * gemini-session's example-pack lookup keys off the stored URL's
 * canonical host), while hand-shared entry links carry the agents'
 * vanity domains (martinezrealtorsfl.com / sapersteinrealty.com).
 * Homepage equality can never hold across those links, and holding
 * the loader on the mismatch is fatal, not cautious: the gate
 * early-returns ABOVE the pinned reveal machinery (stored-content
 * reveal + the 15s deadline), so the curtain never lifted — both
 * Frank demos sat at the 88% asymptote for every visitor arriving
 * on a vanity-domain link, while canonical (grid) links revealed.
 * For a pinned leadId the merged record is sufficient regardless of
 * homepage equality, in any URL form.
 */
export const shouldWaitForFreshLeadData = (
  requestedHomepage: string | null,
  currentHomepage: string | null,
  hasRouterLeadData: boolean,
  isPinnedExample: boolean,
) =>
  Boolean(
    requestedHomepage &&
      !hasRouterLeadData &&
      currentHomepage &&
      currentHomepage !== requestedHomepage &&
      !isPinnedExample,
  );
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
 * CONSENT-COVERED ROUTE (Publish #48 follow-up, 2026-11-14).
 *
 * Publish #48 taught every surface WE control to dismiss the
 * prospect site's cookie/privacy banner (scan captures, and the
 * Browserbase live view where dismissal runs over CDP). One surface
 * stayed uncovered: an EMBEDDABLE site presented through DemoSite's
 * raw cross-origin iframe — the browser forbids scripting another
 * origin's DOM, so the banner sat in the middle of the live demo
 * (verified live on the Martinez demo, 2026-11-14).
 *
 * When check-iframe-embed reports the site embeddable AND its HTML
 * carries a consent-banner fingerprint (`consentDetected`), the
 * demo's live presentation routes through the covered Browserbase
 * live view instead. Blocked / mixed-content sites keep the existing
 * fallback chain (requiresBrowserFallback), and unreachable sites
 * keep theirs — the covered route exists only for the embeddable
 * case those chains never reach.
 *
 * Why not covered-view-for-everyone? Browserbase sessions are a
 * metered, capped resource in this codebase: create-browser-session
 * opens keepAlive sessions with a 300s timeout, anticipates quota
 * refusals (402/429 → QUOTA_EXCEEDED), and the cost rule on
 * shouldStartRemotePreview above exists precisely to avoid spending
 * a session when a cheaper surface suffices; a covered session also
 * takes seconds of CDP navigation + dismissal time before it can be
 * handed over, where the raw iframe paints natively. Sites WITHOUT
 * a banner gain nothing from the covered view, so only
 * banner-carrying sites pay for it.
 */
export const shouldUseConsentCoveredRoute = (
  consentDetected: boolean,
  requiresBrowserFallback: boolean,
  isWebsiteUnreachable: boolean,
) => consentDetected && !requiresBrowserFallback && !isWebsiteUnreachable;

/**
 * Whether to start the Browserbase live view at all. The blocked /
 * mixed-content fallback keeps its screenshot cost rule
 * (shouldStartRemotePreview). The consent-covered route starts the
 * session REGARDLESS of the stored screenshot: the screenshot is
 * only the interim visual while the covered view spins up — it is
 * static, and the demo's live presentation for an embeddable site
 * is a live, interactive site, so a capture must not gate it.
 */
export const shouldStartLiveView = (
  needsFallback: boolean,
  hasScreenshot: boolean,
  screenshotFailed: boolean,
  consentCoveredRoute: boolean,
) => consentCoveredRoute || shouldStartRemotePreview(needsFallback, hasScreenshot, screenshotFailed);

/**
 * Whether the raw cross-origin iframe may be the demo's live
 * presentation. On the consent-covered route the raw iframe is the
 * LAST RESORT: it stays unmounted while the covered view is pending
 * or live (mounting it would flash the very banner the route exists
 * to remove), and takes over only once the covered view has failed
 * (session refused / quota, navigation incomplete, or its 15s load
 * budget expired). Off the covered route it is the primary live
 * surface, exactly as before.
 */
export const canPresentRawIframe = (consentCoveredRoute: boolean, coveredViewFailed: boolean) =>
  !consentCoveredRoute || coveredViewFailed;

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

/**
 * Hard terminal guarantee for PINNED example demos (Publish #43
 * regression round 2, 2026-11-14). A pinned demo's stored scan
 * content is a complete preview by itself, so its reveal must never
 * depend on a chain of sequential waits — iframe-embed check, then a
 * multi-megabyte screenshot download, then a third-party iframe load
 * event, then an 8s rescue timer. On a slow network, or in a browser
 * tab whose timers are throttled, that chain stretched past three
 * minutes on the Frank pinned demos while the scan content sat
 * rendered behind the curtain (Aurelia's lead escaped only because
 * her chain happened to settle through the fallback state).
 *
 * Two mechanisms enforce the guarantee in DemoSite:
 *  1. Stored-content reveal: the moment a pinned lead's record has
 *     merged and carries scan content, the demo reveals on that
 *     content on EVERY preview path (inline iframe included) —
 *     richer previews still take over when they arrive.
 *  2. This deadline: if a pinned demo still has not revealed 15s
 *     after mount, every preview gate is force-settled (iframe
 *     counts as blocked, screenshot and live view count as failed)
 *     and the stored record is pulled once more, so the curtain
 *     cannot outlive the deadline once content exists.
 */
export const PINNED_REVEAL_DEADLINE_MS = 15000;
