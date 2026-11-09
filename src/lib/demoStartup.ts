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
