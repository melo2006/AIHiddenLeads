/**
 * Screenshot banner guard for scan-website (Publish #63, 2026-11-15).
 *
 * THE DEFECT: the 2026-11-15 morning re-scan of the Martinez lead
 * stored a fresh desktop screenshot WITH the site's privacy banner
 * baked into it — the scan's own consent record for that run reads
 * consent_banner_seen=true, consent_banner_dismissed=false — and
 * the write replaced the previously stored CLEAN screenshot, so
 * every later demo of that business opened on the banner. The
 * capture pipeline already runs the dismissal script and already
 * witnesses the outcome (consent-scan-probe.ts); nothing connected
 * that witness to the screenshot write.
 *
 * THE RULE (the content-overwrite guard's keep-stored philosophy,
 * applied to screenshots): a stored screenshot may only be
 * replaced by a capture that was taken AFTER a successful banner
 * dismissal. When this scan WITNESSED a banner on the page
 * (seen=true) and did NOT dismiss it (dismissed=false), this scan's
 * real capture is presumed to carry the banner, and the previously
 * stored screenshot is KEPT — provided there is a real one to keep:
 *
 *   1. The stored screenshot must be a real capture — a generated
 *      placeholder (the data:image/svg+xml fallback, the same
 *      signal isGeneratedPlaceholderScreenshot reads in
 *      demo-invite.ts) is not worth protecting over a real, if
 *      banner-carrying, capture.
 *   2. The new screenshot must be a REAL capture too (Browserless
 *      or Firecrawl). A generated placeholder contains no banner;
 *      the guard is not about it.
 *   3. The witness must be THIS scan's: an unrecorded witness
 *      (null flags — the probe could not see the page) is not a
 *      failed dismissal, and the write proceeds exactly as before.
 *
 * scan-website additionally persists consent_banner_dismissed as
 * THIS scan witnessed it (false) whenever the witness is
 * seen-and-not-dismissed, so the row never claims a dismissal the
 * latest capture did not perform.
 *
 * Pure and dependency-free: unit-tested from src/test like the
 * other _shared modules; scan-website supplies the signals.
 */

export interface ScreenshotBannerGuardInput {
  /** The lead's currently stored desktop screenshot, if any. */
  storedScreenshot?: string | null;
  /** This scan's screenshot provenance ('browserless' | 'firecrawl' | 'generated'). */
  nextProvider?: string | null;
  /** This scan's consent witness: a banner was present on the page. */
  bannerSeen?: boolean | null;
  /** This scan's consent witness: the capture dismissed the banner. */
  bannerDismissed?: boolean | null;
}

/** True for the two real-capture providers (a generated placeholder is not a capture). */
export function isRealCaptureProvider(provider: string | null | undefined): boolean {
  return provider === "browserless" || provider === "firecrawl";
}

/** True when a screenshot value is a real capture rather than empty or the generated placeholder. */
export function isRealStoredScreenshot(value: string | null | undefined): boolean {
  return typeof value === "string" && value.length > 0 && !value.startsWith("data:image/svg+xml");
}

/**
 * Decide whether the previously stored screenshot must be kept over
 * this scan's capture. See the module header for the rule.
 */
export function shouldKeepStoredScreenshot(input: ScreenshotBannerGuardInput): boolean {
  if (!isRealStoredScreenshot(input.storedScreenshot)) return false;
  if (!isRealCaptureProvider(input.nextProvider)) return false;
  return input.bannerSeen === true && input.bannerDismissed !== true;
}

/**
 * The screenshot value to store for one field: the stored one when
 * the guard fires AND a stored value exists for that field, else
 * this scan's value, exactly as the unguarded write would store it.
 */
export function guardedScreenshotValue(
  storedValue: string | null | undefined,
  nextValue: string | null,
  keepStored: boolean,
): string | null {
  return keepStored && storedValue ? storedValue : nextValue;
}
