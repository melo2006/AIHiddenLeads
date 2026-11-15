// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONTENT_GUARD_COLLAPSE_RATIO,
  CONTENT_GUARD_MAX_STARVED_SCRAPE_CHARS,
  CONTENT_GUARD_MIN_STORED_CHARS,
  isResearchOnlyContent,
  scanStarved,
  shouldKeepStoredContent,
  type ContentOverwriteSignals,
} from "../../supabase/functions/_shared/content-overwrite-guard";

// SCAN CONTENT-OVERWRITE GUARD (2026-11-14): when a site's capture
// gets bot-walled or its scrape starves, scan-website used to
// complete anyway and overwrite the lead's stored website_content
// with a ~1.7k-char research-only summary — destroying a previously
// captured rich scrape (Martinez: 133k–146k chars in the morning,
// 1,735 chars of wrong-person research by the afternoon). The guard
// keeps the stored content when it is substantial, the new content
// collapses to a fraction of it, AND the scan's own signals say it
// starved. A real (even much smaller) scrape must still overwrite.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const scanSource = read("../../supabase/functions/scan-website/index.ts");

const chars = (n: number, ch = "x") => ch.repeat(n);

/** A starved scan's output: generated research, no scraped sections. */
const researchOnly = (n: number) =>
  `\n\n=== GENERATED RESEARCH SUMMARY (verify against original sources) ===\n${chars(n)}`;

/** A real scrape's stored shape: scraped sections + generated summary. */
const realScrape = (scraped: number, summary = 1500) =>
  `LEARNING COVERAGE: depth 1\n\n=== HOMEPAGE CONTENT ===\n${chars(scraped)}\n\n=== GENERATED BUSINESS SUMMARY ===\n${chars(summary, "y")}`;

const starvedSignals: ContentOverwriteSignals = {
  scrapeLength: 0,
  botWall: false,
  screenshotProvider: "generated",
};

const healthySignals: ContentOverwriteSignals = {
  scrapeLength: 40_000,
  botWall: false,
  screenshotProvider: "browserless",
};

describe("isResearchOnlyContent", () => {
  it("is true for a generated summary with no scraped sections", () => {
    expect(isResearchOnlyContent(researchOnly(1700))).toBe(true);
  });

  it("is true for the main save's business-summary shape when nothing was scraped", () => {
    expect(isResearchOnlyContent(`LEARNING COVERAGE: depth 1\n\n=== GENERATED BUSINESS SUMMARY ===\n${chars(900, "y")}`)).toBe(true);
  });

  it("is false once any scraped section is present", () => {
    expect(isResearchOnlyContent(realScrape(3000))).toBe(false);
    expect(isResearchOnlyContent(`${researchOnly(900)}\n\n=== UPLOADED DOCUMENTS ===\n${chars(400)}`)).toBe(false);
  });

  it("is false for plain scraped text with no generated section", () => {
    expect(isResearchOnlyContent(chars(5000))).toBe(false);
  });

  it("is false for empty input", () => {
    expect(isResearchOnlyContent(null)).toBe(false);
    expect(isResearchOnlyContent(undefined)).toBe(false);
    expect(isResearchOnlyContent("")).toBe(false);
  });
});

describe("shouldKeepStoredContent — first scans and thin stored content", () => {
  it("never fires when there is no stored content (first scan)", () => {
    expect(shouldKeepStoredContent(null, researchOnly(1700), starvedSignals)).toBe(false);
    expect(shouldKeepStoredContent(undefined, researchOnly(1700), starvedSignals)).toBe(false);
    expect(shouldKeepStoredContent("", researchOnly(1700), starvedSignals)).toBe(false);
  });

  it("never fires when the stored content is thin, even for a starved collapse", () => {
    expect(shouldKeepStoredContent(chars(5_000), researchOnly(100), starvedSignals)).toBe(false);
  });

  it("boundary: stored exactly at the minimum is not protected", () => {
    expect(shouldKeepStoredContent(chars(CONTENT_GUARD_MIN_STORED_CHARS), researchOnly(100), starvedSignals)).toBe(false);
  });

  it("boundary: stored one char above the minimum is protected when starved", () => {
    expect(shouldKeepStoredContent(chars(CONTENT_GUARD_MIN_STORED_CHARS + 1), researchOnly(100), starvedSignals)).toBe(true);
  });
});

describe("shouldKeepStoredContent — healthy overwrites still flow", () => {
  it("allows a comparable-size healthy rescan", () => {
    expect(shouldKeepStoredContent(chars(50_000), realScrape(45_000), healthySignals)).toBe(false);
  });

  it("allows a larger healthy rescan", () => {
    expect(shouldKeepStoredContent(chars(50_000), realScrape(90_000), healthySignals)).toBe(false);
  });

  it("boundary: new content exactly at the collapse ratio overwrites even when starved", () => {
    const stored = chars(40_000);
    const next = researchOnly(Math.floor(40_000 * CONTENT_GUARD_COLLAPSE_RATIO));
    expect(next.length).toBeGreaterThanOrEqual(stored.length * CONTENT_GUARD_COLLAPSE_RATIO);
    expect(shouldKeepStoredContent(stored, next, starvedSignals)).toBe(false);
  });

  it("allows a real-but-smaller scrape from a redesigned site", () => {
    // The site shrank from a 130k scrape to a one-pager: the new
    // content collapses in length but carries a REAL homepage
    // scrape and a real screenshot — the guard must stay out.
    const next = realScrape(3_000);
    const signals: ContentOverwriteSignals = {
      scrapeLength: 3_000,
      botWall: false,
      screenshotProvider: "browserless",
    };
    expect(next.length).toBeLessThan(130_000 * CONTENT_GUARD_COLLAPSE_RATIO);
    expect(shouldKeepStoredContent(chars(130_000), next, signals)).toBe(false);
  });
});

describe("shouldKeepStoredContent — the starved collapse (Martinez shape)", () => {
  const stored = chars(140_000);
  const next = researchOnly(1_735);

  it("fires on the proven defect shape: rich stored, research-only next, empty scrape", () => {
    expect(shouldKeepStoredContent(stored, next, starvedSignals)).toBe(true);
  });

  it("fires on scrape length alone (no other signal needed)", () => {
    expect(
      shouldKeepStoredContent(stored, next, { scrapeLength: 0, botWall: false, screenshotProvider: "browserless" }),
    ).toBe(true);
  });

  it("fires on the bot-wall signal even when some text came back", () => {
    expect(
      shouldKeepStoredContent(stored, next, { scrapeLength: 5_000, botWall: true, screenshotProvider: "browserless" }),
    ).toBe(true);
  });

  it("fires on the generated-screenshot signal even when some text came back", () => {
    expect(
      shouldKeepStoredContent(stored, next, { scrapeLength: 5_000, botWall: false, screenshotProvider: "generated" }),
    ).toBe(true);
  });

  it("fires on research-only structure even when the other signals look healthy", () => {
    expect(
      shouldKeepStoredContent(stored, next, { scrapeLength: 5_000, botWall: false, screenshotProvider: "firecrawl" }),
    ).toBe(true);
  });

  it("fires when the scan produced no content at all", () => {
    expect(shouldKeepStoredContent(stored, "", starvedSignals)).toBe(true);
    expect(shouldKeepStoredContent(stored, null, starvedSignals)).toBe(true);
  });

  it("boundary: scrape length at the starved ceiling still counts as starved", () => {
    const nextWithSection = realScrape(CONTENT_GUARD_MAX_STARVED_SCRAPE_CHARS);
    expect(
      shouldKeepStoredContent(stored, nextWithSection, {
        scrapeLength: CONTENT_GUARD_MAX_STARVED_SCRAPE_CHARS,
        botWall: false,
        screenshotProvider: "browserless",
      }),
    ).toBe(true);
  });

  it("boundary: scrape length one above the ceiling, with real sections, does not fire", () => {
    const nextWithSection = realScrape(CONTENT_GUARD_MAX_STARVED_SCRAPE_CHARS + 1);
    expect(
      shouldKeepStoredContent(stored, nextWithSection, {
        scrapeLength: CONTENT_GUARD_MAX_STARVED_SCRAPE_CHARS + 1,
        botWall: false,
        screenshotProvider: "browserless",
      }),
    ).toBe(false);
  });

  it("does not fire on collapse alone when the scan demonstrably read the site", () => {
    // Length collapsed and the next content is short, but the scan
    // gathered real content and captured a real screenshot, and
    // the next content carries scraped sections — not starvation.
    const signals: ContentOverwriteSignals = {
      scrapeLength: 8_000,
      botWall: false,
      screenshotProvider: "browserless",
    };
    expect(scanStarved(signals, realScrape(8_000))).toBe(false);
    expect(shouldKeepStoredContent(stored, realScrape(8_000), signals)).toBe(false);
  });
});

describe("scan-website wiring (source pins)", () => {
  it("imports the guard from the shared module", () => {
    expect(scanSource).toContain("from '../_shared/content-overwrite-guard.ts'");
    expect(scanSource).toContain("shouldKeepStoredContent");
  });

  it("guards BOTH website_content writes (main save + background enrichment)", () => {
    const decisions = scanSource.match(/shouldKeepStoredContent\(/g) ?? [];
    expect(decisions.length).toBe(2);
  });

  it("logs the [ContentGuard] line at both write sites", () => {
    const logs = scanSource.match(/\[ContentGuard\] kept stored content/g) ?? [];
    expect(logs.length).toBe(2);
  });

  it("reads the stored content before the main save", () => {
    expect(scanSource).toContain("select('phone, email, website_content')");
    expect(scanSource).toContain("storedWebsiteContent");
  });

  it("holds back only website_content on the main save when the guard fires", () => {
    expect(scanSource).toContain("...(keepStoredContent ? {} : { website_content: initialContent || null })");
  });

  it("passes the scan's signals into backgroundEnrich for its own guard", () => {
    expect(scanSource).toContain("contentGuardSignals");
    expect(scanSource).toContain("botWall: looksLikeBotWall(homepageMarkdown)");
  });

  it("keeps the enriched status transition when the enrichment write is held back", () => {
    expect(scanSource).toContain("scan_status: 'enriched'");
  });
});
