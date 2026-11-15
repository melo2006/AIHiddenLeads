// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  guardedScreenshotValue,
  isRealCaptureProvider,
  isRealStoredScreenshot,
  shouldKeepStoredScreenshot,
} from "../../supabase/functions/_shared/screenshot-banner-guard";

// Publish #63 (2026-11-15): the screenshot banner guard. The
// morning's Martinez re-scan stored a screenshot WITH the site's
// privacy banner (its own consent record: seen=true,
// dismissed=false) over the previously stored clean screenshot.
// The rule: a stored screenshot is replaced only by a capture taken
// after a successful dismissal; a witnessed-but-undismissed banner
// keeps the stored screenshot.

const REAL_STORED = "https://example.supabase.co/storage/v1/object/public/screenshots/lead/desktop.png";
const GENERATED_STORED = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0i";

describe("shouldKeepStoredScreenshot — the banner guard matrix", () => {
  it("keeps the stored screenshot when a banner was seen and NOT dismissed, over a real capture", () => {
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: "browserless", bannerSeen: true, bannerDismissed: false })).toBe(true);
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: "firecrawl", bannerSeen: true, bannerDismissed: false })).toBe(true);
    // A null dismissed (witness recorded seen, dismissal unrecorded) is not a dismissal.
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: "browserless", bannerSeen: true, bannerDismissed: null })).toBe(true);
  });

  it("never keeps when the dismissal succeeded, or no banner was seen", () => {
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: "browserless", bannerSeen: true, bannerDismissed: true })).toBe(false);
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: "browserless", bannerSeen: false, bannerDismissed: false })).toBe(false);
  });

  it("never keeps when the witness is unrecorded (null flags)", () => {
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: "browserless", bannerSeen: null, bannerDismissed: null })).toBe(false);
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: "browserless", bannerSeen: undefined, bannerDismissed: undefined })).toBe(false);
  });

  it("never keeps a generated placeholder, and never fires for a generated next capture", () => {
    expect(shouldKeepStoredScreenshot({ storedScreenshot: GENERATED_STORED, nextProvider: "browserless", bannerSeen: true, bannerDismissed: false })).toBe(false);
    expect(shouldKeepStoredScreenshot({ storedScreenshot: null, nextProvider: "browserless", bannerSeen: true, bannerDismissed: false })).toBe(false);
    expect(shouldKeepStoredScreenshot({ storedScreenshot: "", nextProvider: "browserless", bannerSeen: true, bannerDismissed: false })).toBe(false);
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: "generated", bannerSeen: true, bannerDismissed: false })).toBe(false);
    expect(shouldKeepStoredScreenshot({ storedScreenshot: REAL_STORED, nextProvider: null, bannerSeen: true, bannerDismissed: false })).toBe(false);
  });

  it("provider and stored-value classifiers", () => {
    expect(isRealCaptureProvider("browserless")).toBe(true);
    expect(isRealCaptureProvider("firecrawl")).toBe(true);
    expect(isRealCaptureProvider("generated")).toBe(false);
    expect(isRealStoredScreenshot(REAL_STORED)).toBe(true);
    expect(isRealStoredScreenshot(GENERATED_STORED)).toBe(false);
    expect(isRealStoredScreenshot(null)).toBe(false);
  });
});

describe("guardedScreenshotValue — per-field keep", () => {
  it("returns the stored value only when keeping AND a stored value exists for that field", () => {
    expect(guardedScreenshotValue(REAL_STORED, "https://new.example/shot.png", true)).toBe(REAL_STORED);
    expect(guardedScreenshotValue(null, "https://new.example/shot.png", true)).toBe("https://new.example/shot.png");
    expect(guardedScreenshotValue(REAL_STORED, "https://new.example/shot.png", false)).toBe("https://new.example/shot.png");
    expect(guardedScreenshotValue(REAL_STORED, null, false)).toBeNull();
  });
});

describe("scan-website wiring — the guard actually gates both screenshot writes", () => {
  // scan-website is a Deno entrypoint and cannot be imported into
  // vitest; its wiring contract is pinned from the source, the same
  // pattern consent-scan-wiring.test.ts uses.
  const scanSource = readFileSync(new URL("../../supabase/functions/scan-website/index.ts", import.meta.url), "utf8");

  it("settles the witness and the guard verdict before the first screenshot write", () => {
    const verdict = scanSource.indexOf("const keepStoredScreenshots = shouldKeepStoredScreenshot({");
    const previewWrite = scanSource.indexOf("website_screenshot: guardedPreviewScreenshot,");
    expect(verdict).toBeGreaterThan(-1);
    expect(previewWrite).toBeGreaterThan(-1);
    expect(verdict).toBeLessThan(previewWrite);
  });

  it("guards the preview save and the final save, per field", () => {
    expect(scanSource).toContain("website_screenshot: guardedPreviewScreenshot,");
    expect(scanSource).toContain("screenshot_tablet: guardedPreviewTablet,");
    expect(scanSource).toContain("screenshot_mobile: guardedPreviewMobile,");
    expect(scanSource).toContain("website_screenshot: guardedScreenshotValue(storedScreenshots.desktop, storedScreenshot, keepStoredScreenshots),");
    expect(scanSource).toContain("screenshot_tablet: guardedScreenshotValue(storedScreenshots.tablet, browserlessResults.tablet || null, keepStoredScreenshots),");
    expect(scanSource).toContain("screenshot_mobile: guardedScreenshotValue(storedScreenshots.mobile, browserlessResults.mobile || null, keepStoredScreenshots),");
  });

  it("persists the honest dismissal state when this scan saw a banner it did not dismiss", () => {
    expect(scanSource).toContain("if (witnessedConsentFlags?.seen === true && witnessedConsentFlags?.dismissed !== true) {");
    expect(scanSource).toContain("consentFlags = { ...consentFlags, dismissed: false };");
  });
});
