// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";
import { isCapturedCopyPreview } from "../lib/demoStartup";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const scanSource = read("../../supabase/functions/scan-website/index.ts");
const firecrawlShotSource = read("../../supabase/functions/_shared/firecrawl-screenshot.ts");
const sessionSource = read("../../supabase/functions/gemini-session/index.ts");
const proxySource = read("../../supabase/functions/gemini-live-proxy/index.ts");
const demoSiteSource = read("../pages/DemoSite.tsx");

// The scan function is a Deno entrypoint (Deno.serve + an esm.sh import at
// module top level), so it cannot be imported into vitest. Its capture
// contract is pinned from the source — the same pattern the avatar-swap
// tests use for the gemini-session authorization rules.

describe("full-page capture (scan-website)", () => {
  it("desktop is the ONLY full-page config; tablet/mobile stay viewport captures", () => {
    expect(scanSource).toContain("suffix: 'desktop', startDelayMs: 0, fullPage: true");
    expect(scanSource).not.toMatch(/suffix: '(tablet|mobile)'[^}]*fullPage/);
  });

  it("the Browserless request derives fullPage from the viewport config", () => {
    expect(scanSource).toContain("fullPage: viewport.fullPage === true");
  });

  it("the height cap is 12000 CSS px and reaches the in-page prep script", () => {
    expect(scanSource).toContain("export const FULL_PAGE_MAX_HEIGHT = 12000;");
    expect(scanSource).toContain("const FULL_PAGE_MAX_HEIGHT = ${FULL_PAGE_MAX_HEIGHT};");
    expect(scanSource).toContain("measureAndPinPageHeight();");
  });

  it("the pinned page height is what the layout reports (scrollbar-at-edge trick)", () => {
    // Cheap full-page technique: html is 100000px tall so the fixed
    // scrollbar paints at the capture's bottom edge, not mid-page.
    expect(scanSource).toContain("document.documentElement.style.setProperty('height', '100000px', 'important');");
    expect(scanSource).toContain("return Math.min(reportedPageHeight(), FULL_PAGE_MAX_HEIGHT);");
    expect(scanSource).toContain("const fullPageHeightPx = measuredFullPageHeight ?? viewport.height;");
    expect(scanSource).toContain("height: fullPageHeightPx, scale: 1");
  });

  it("Firecrawl fallback asks for a full-page screenshot at desktop size (v2 format object)", () => {
    // v1's `screenshotOptions` key is rejected by Firecrawl now (400,
    // 2026-11-13); v2 carries the options inside the screenshot format
    // object, built by the shared client the fallback calls.
    expect(firecrawlShotSource).toContain(
      "{ type: 'screenshot', fullPage: true, viewport: { width: 1920, height: 1080 } }",
    );
    expect(firecrawlShotSource).toContain("https://api.firecrawl.dev/v2");
    expect(scanSource).toContain("fetchFirecrawlScreenshot(url, apiKey, {");
    // The fallback capture dismisses the site's cookie banner first (demo
    // surfaces must not show it) — see _shared/cookie-consent-dismissal.ts.
    expect(scanSource).toContain(
      "consentDismissalScript: buildCookieConsentDismissalScript({ observeMs: 3000 })",
    );
    expect(scanSource).not.toContain("screenshotOptions");
  });

  it("scan-website persists screenshot provenance best-effort (separate update)", () => {
    expect(scanSource).toContain("screenshot_provider: screenshotProvider");
    expect(scanSource).toContain("column may not be applied yet");
  });

  it("oversized captures are JPEG-capped via the browser, never kept as expiring URLs", () => {
    expect(scanSource).toContain("export const SCREENSHOT_MAX_BYTES = REHOST_MAX_BYTES;");
    expect(scanSource).toContain("export async function shrinkScreenshotViaBrowser(");
    expect(scanSource).toContain("canvas.toDataURL('image/jpeg', ${quality})");
    expect(scanSource).toContain("capped.wasConverted");
    // The old declared-length dead-link shortcut is gone: between the
    // storage bound and the download ceiling the bytes are capped, not kept.
    expect(scanSource).not.toContain("Screenshot too large (${declaredLength} bytes), keeping original URL");
    expect(scanSource).toContain("REHOST_DOWNLOAD_CEILING = 32 * 1024 * 1024");
  });

  it("the Browserless upload stores the capped bytes under the matching extension", () => {
    expect(scanSource).toContain("`${leadId}.${capped.extension}`");
    expect(scanSource).toContain("contentType: uploadType,");
  });
});

describe("Browserless cap await (…-tablet.undefined / 0-byte upload regression, 2026-11-14)", () => {
  // capScreenshotBytes is async (it wraps the async capScreenshotBytesWith).
  // The Browserless upload path once read .extension/.bytes/.type off the
  // UN-AWAITED call, so every field was undefined: uploads landed as
  // "<leadId>-tablet.undefined" / "<leadId>-mobile.undefined", 0 bytes,
  // served as text/plain — the broken screenshot_tablet/screenshot_mobile
  // variants on the pinned example leads. The rehost path (via the injected
  // capBytes dep) always awaited correctly; only this caller missed it.
  it("the cap helper really is async, so its result must be awaited", () => {
    expect(scanSource).toContain("export async function capScreenshotBytesWith(");
    expect(scanSource).toContain("const capScreenshotBytes = (buffer: ArrayBuffer, apiKey?: string | null) =>");
  });

  it("the Browserless capture path awaits the cap before reading its fields", () => {
    expect(scanSource).toContain("const capped = await capScreenshotBytes(buffer);");
    expect(scanSource).not.toContain("const capped = capScreenshotBytes(buffer);");
  });

  it("EVERY call site of capScreenshotBytes in the function is awaited", () => {
    // Matches call sites only: the definition is `const capScreenshotBytes =`
    // (no paren) and capScreenshotBytesWith( has "With" before the paren.
    const callSites = [...scanSource.matchAll(/capScreenshotBytes\(/g)];
    expect(callSites.length).toBeGreaterThan(0);
    for (const site of callSites) {
      const before = scanSource.slice(Math.max(0, (site.index ?? 0) - 6), site.index);
      expect(before).toBe("await ");
    }
  });

  it("the awaited result is what reaches the storage upload (name, body, type)", () => {
    expect(scanSource).toContain("const uploadBytes = capped.bytes;");
    expect(scanSource).toContain("const uploadType = capped.type;");
    expect(scanSource).toContain("`${leadId}-${viewport.suffix}.${capped.extension}`");
    // The capped result only ever carries a real image extension.
    expect(scanSource).toContain("extension: 'png'");
    expect(scanSource).toContain("extension: 'jpg'");
  });
});

// A PNG whose size betrays a solid-color frame. Mirrors the pure helper's
// construction in scan-website (signature + IHDR + filler under budget).
const makePng = (width: number, height: number, totalBytes: number): Uint8Array => {
  const bytes = new Uint8Array(totalBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

// Same budget math as blankFrameBudgetBytes in scan-website: the 15 KB
// flat budget at the 1200x700 minimum size, scaled by pixel count.
const budgetFor = (w: number, h: number) =>
  Math.min(8 * 1024 * 1024, Math.max(15 * 1024, Math.floor((w * h * (15 * 1024)) / (1200 * 700))));

describe("blank-frame guard — budget geometry (source-mirror of isLikelyBlankPng)", () => {
  it("is exported as pure helpers from the scan function", () => {
    expect(scanSource).toContain("export function blankFrameBudgetBytes(width: number, height: number): number");
    expect(scanSource).toContain("export function isLikelyBlankPng(bytes: Uint8Array): boolean");
    expect(scanSource).toContain(
      "Math.floor(pixels * (BLANK_FRAME_MAX_BYTES / (BLANK_FRAME_MIN_WIDTH * BLANK_FRAME_MIN_HEIGHT)))",
    );
  });

  it("REGRESSION (greatgulf.com): the original 1920x1080 solid-navy frame stays rejected", () => {
    // The verified real case: 8,517 bytes at 1920x1080.
    const frame = makePng(1920, 1080, 8517);
    expect(frame.byteLength).toBeLessThan(budgetFor(1920, 1080));
    expect(budgetFor(1920, 1080)).toBe(37917); // scaled budget still far above 8,517
  });

  it("a TALL blank frame (1920x12000 solid color) is still rejected", () => {
    // A solid color at the full-page cap compresses to tens of KB — the
    // proportional budget at this size is ~420 KB, so a 60 KB tall blank
    // is caught.
    expect(makePng(1920, 12000, 60000).byteLength).toBeLessThan(budgetFor(1920, 12000));
  });

  it("a tall REAL page (photo-heavy, megabytes) is never rejected", () => {
    expect(makePng(1920, 12000, 5 * 1024 * 1024).byteLength).toBeGreaterThan(budgetFor(1920, 12000));
  });

  it("small images keep the old exemptions (below desktop minimums)", () => {
    expect(budgetFor(800, 600)).toBe(15 * 1024); // floor = historic flat budget
  });
});

describe("protected-site note (DemoSite)", () => {
  it("shows ONLY for blocked verdict + stored screenshot + no live view", () => {
    expect(isCapturedCopyPreview("blocked", true, false, false)).toBe(true);
    // Embeddable site (no failure mode) — no note.
    expect(isCapturedCopyPreview(null, true, false, false)).toBe(false);
    // Unreachable is a different problem — the "site did not respond" card owns it.
    expect(isCapturedCopyPreview("unreachable", true, false, false)).toBe(false);
    // Browserbase live view is showing the REAL site — no note.
    expect(isCapturedCopyPreview("blocked", true, false, true)).toBe(false);
    // Dead screenshot (failed) or no screenshot — nothing captured to point at.
    expect(isCapturedCopyPreview("blocked", true, true, false)).toBe(false);
    expect(isCapturedCopyPreview("blocked", false, false, false)).toBe(false);
  });

  it("DemoSite renders the note in the header from the shared predicate", () => {
    expect(demoSiteSource).toContain("isCapturedCopyPreview(iframeFailureMode, Boolean(screenshotSrc), hasScreenshotFailed, isLivePreviewReady)");
    expect(demoSiteSource).toContain('t("tryDemo.capturedCopyNote")');
    // The generated SVG placeholder never earns the note (it is not a capture).
    expect(demoSiteSource).toContain("!isGeneratedScreenshot &&");
  });

  it("copy is the owner's approved line, translated in all three locales", () => {
    expect(en.tryDemo.capturedCopyNote).toBe(
      "This website's security settings don't allow a live replica, so this demo runs on a captured copy.",
    );
    expect(es.tryDemo.capturedCopyNote).toContain("copia capturada");
    expect(pt.tryDemo.capturedCopyNote).toContain("cópia capturada");
  });
});

describe("captured-copy voice flag — NO new plumbing (parent boundary ruling 2026-11-09)", () => {
  // Brief §2 verdict: the session invoke lives in GeminiConversation.tsx,
  // which is outside this build's footprint (parallel swap-audio-fix build
  // owns it). No existing flag flows from DemoSite's embed verdict into the
  // voice session, so per the brief's own stop rule NO new plumbing was
  // built: the on-page note ships alone, and these pins record that the
  // flag was deliberately NOT wired through the client or the functions.
  it("DemoSite does NOT forward a capturedCopy prop into the widget", () => {
    expect(demoSiteSource).not.toContain("capturedCopy={");
  });

  it("gemini-session and the proxy carry no capturedCopy handling from this build", () => {
    expect(sessionSource).not.toContain("capturedCopy");
    expect(proxySource).not.toContain("CAPTURED_COPY_NOTE");
    expect(proxySource).not.toContain("capturedCopy");
  });
});
