// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getResponsiveScreenshotSrc } from "../components/landing/demo-results/demoResultsUtils";

// Demo capture fix (2026-11-21): the responsive screenshot picker's
// PHONE order. The tablet capture is a single viewport-height shot;
// on the Richard Steinberg Team site that one viewport was all sky
// (no name, no content) and on Michael Martinez's site it was the
// host's bot-check page, while both leads' full-page DESKTOP
// captures are the real sites. The old order (mobile -> tablet ->
// desktop) served those bad tablet shots to every phone visitor.
// The new phone order is: real mobile -> real desktop -> real
// tablet, with the generated SVG placeholder treated as absent (a
// placeholder desktop must not shadow a real tablet capture —
// Danielle Lazier). Tablet and desktop widths keep the old order.

const DESKTOP = "https://example.supabase.co/storage/v1/object/public/website-screenshots/lead-desktop.png";
const TABLET = "https://example.supabase.co/storage/v1/object/public/website-screenshots/lead-tablet.png";
const MOBILE = "https://example.supabase.co/storage/v1/object/public/website-screenshots/lead-mobile.png";
const PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E";

describe("getResponsiveScreenshotSrc — phone width (<=480)", () => {
  it("prefers a real mobile capture over everything", () => {
    expect(
      getResponsiveScreenshotSrc({ screenshot: DESKTOP, screenshotTablet: TABLET, screenshotMobile: MOBILE }, 390),
    ).toBe(MOBILE);
  });

  it("serves the full-page desktop capture when mobile is missing but a tablet shot exists (Steinberg/Martinez case)", () => {
    expect(
      getResponsiveScreenshotSrc({ screenshot: DESKTOP, screenshotTablet: TABLET, screenshotMobile: undefined }, 390),
    ).toBe(DESKTOP);
  });

  it("falls through a placeholder desktop to a real tablet capture (Lazier case)", () => {
    expect(
      getResponsiveScreenshotSrc({ screenshot: PLACEHOLDER, screenshotTablet: TABLET, screenshotMobile: undefined }, 390),
    ).toBe(TABLET);
  });

  it("serves the tablet capture when it is the only real variant", () => {
    expect(
      getResponsiveScreenshotSrc({ screenshot: undefined, screenshotTablet: TABLET, screenshotMobile: undefined }, 414),
    ).toBe(TABLET);
  });

  it("serves the desktop capture when it is the only variant", () => {
    expect(getResponsiveScreenshotSrc({ screenshot: DESKTOP }, 390)).toBe(DESKTOP);
  });

  it("keeps the placeholder as the last resort when nothing real is stored", () => {
    expect(
      getResponsiveScreenshotSrc({ screenshot: PLACEHOLDER, screenshotTablet: undefined, screenshotMobile: undefined }, 390),
    ).toBe(PLACEHOLDER);
  });

  it("returns null when nothing is stored", () => {
    expect(getResponsiveScreenshotSrc({}, 390)).toBeNull();
  });
});

describe("getResponsiveScreenshotSrc — tablet and desktop widths unchanged", () => {
  it("prefers the tablet capture at tablet width", () => {
    expect(
      getResponsiveScreenshotSrc({ screenshot: DESKTOP, screenshotTablet: TABLET, screenshotMobile: MOBILE }, 768),
    ).toBe(TABLET);
  });

  it("serves the desktop capture at tablet width when no tablet variant exists", () => {
    expect(getResponsiveScreenshotSrc({ screenshot: DESKTOP, screenshotMobile: MOBILE }, 768)).toBe(DESKTOP);
  });

  it("serves the desktop capture at desktop width", () => {
    expect(
      getResponsiveScreenshotSrc({ screenshot: DESKTOP, screenshotTablet: TABLET, screenshotMobile: MOBILE }, 1440),
    ).toBe(DESKTOP);
  });
});
