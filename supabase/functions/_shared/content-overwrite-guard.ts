/**
 * Content-overwrite guard for scan-website (2026-11-14).
 *
 * THE DEFECT: when a site's capture gets bot-walled or its scrape
 * otherwise starves, scan-website still "completes" — and overwrites
 * the lead's stored website_content with a short research-only
 * summary (~1.7k chars), destroying a previously captured rich
 * scrape. Proven live on the Martinez lead (2026-11-14): morning
 * scans stored 133k–146k chars of real site content; by afternoon
 * the row held only the 1,735-char generated research summary —
 * about a same-named agent in another state, imported by web
 * research while the real site was walled. Every later answer for
 * that lead then runs on confabulated research.
 *
 * THE RULE: a starved scan must never destroy richer stored
 * knowledge. Before scan-website overwrites website_content, the
 * pure decision below compares the stored content against what
 * this scan produced. The stored content is KEPT (the write of
 * that one field is skipped; every other field writes as usual)
 * only when ALL of these hold:
 *
 *   1. The stored content is substantial (> MIN_STORED_CHARS) —
 *      a first scan, or a lead whose stored content is already
 *      thin, has nothing worth protecting and writes as today.
 *   2. The new content COLLAPSES to a small fraction of the
 *      stored length (< COLLAPSE_RATIO) — a healthy rescan of
 *      comparable size always overwrites as today.
 *   3. This scan demonstrably STARVED, per its own signals:
 *      it gathered ~no real scraped page content, or the scraped
 *      homepage text is a bot-wall interstitial, or no real
 *      screenshot capture happened (provider 'generated'), or
 *      the new content is research-only (a generated summary
 *      with no scraped sections in it).
 *
 * Condition 3 is what lets a genuinely redesigned, smaller site
 * still replace its content: a real redesign produces a REAL
 * scrape (homepage markdown, scraped sections in the stored
 * text), so the guard stays out of the way even when the new
 * content is much shorter than the old.
 *
 * Pure and dependency-free: unit-tested from src/test like the
 * other _shared modules; scan-website supplies the signals.
 */

/** Signals from one scan run, gathered where the scan happens. */
export interface ContentOverwriteSignals {
  /**
   * Characters of real scraped WEBSITE content this scan produced
   * (homepage markdown + crawled sub-pages + secondary site).
   * Uploaded documents are not website scrape and are excluded.
   * ~0 when the scrape starved or the capture was bot-walled.
   */
  scrapeLength: number;
  /** The scraped homepage text matched a bot-wall interstitial. */
  botWall?: boolean;
  /**
   * Screenshot provenance for this scan ('browserless' | 'firecrawl'
   * | 'generated'); 'generated' means no real capture was made.
   * Optional: the background-enrichment write reuses the main
   * scan's signals object.
   */
  screenshotProvider?: string | null;
}

/** Stored content at or below this size is not worth protecting. */
export const CONTENT_GUARD_MIN_STORED_CHARS = 10_000;

/** New content below this fraction of the stored length is a collapse. */
export const CONTENT_GUARD_COLLAPSE_RATIO = 0.25;

/** A scan that gathered at most this many scraped chars starved. */
export const CONTENT_GUARD_MAX_STARVED_SCRAPE_CHARS = 200;

const GENERATED_SECTION_MARKERS = [
  "=== GENERATED BUSINESS SUMMARY ===",
  "=== GENERATED RESEARCH SUMMARY",
] as const;

const SCRAPED_SECTION_MARKERS = [
  "=== HOMEPAGE CONTENT ===",
  "=== ADDITIONAL WEBSITE CONTENT ===",
  "=== SECONDARY WEBSITE ===",
  "=== UPLOADED DOCUMENTS ===",
] as const;

/**
 * True when a stored-content candidate is only the generated
 * summary/research — it carries a generated section but none of
 * the scraped-evidence sections scan-website writes when it
 * actually read the site.
 */
export function isResearchOnlyContent(content: string | null | undefined): boolean {
  if (!content) return false;
  if (!GENERATED_SECTION_MARKERS.some((marker) => content.includes(marker))) return false;
  return !SCRAPED_SECTION_MARKERS.some((marker) => content.includes(marker));
}

/** True when the scan's own signals say its capture starved. */
export function scanStarved(signals: ContentOverwriteSignals, nextContent: string | null | undefined): boolean {
  if (signals.scrapeLength <= CONTENT_GUARD_MAX_STARVED_SCRAPE_CHARS) return true;
  if (signals.botWall) return true;
  if (signals.screenshotProvider === "generated") return true;
  return isResearchOnlyContent(nextContent);
}

/**
 * Decide whether the stored website_content must be kept over
 * what this scan produced. See the module header for the rule.
 */
export function shouldKeepStoredContent(
  storedContent: string | null | undefined,
  nextContent: string | null | undefined,
  signals: ContentOverwriteSignals,
): boolean {
  const storedLength = storedContent?.length ?? 0;
  if (storedLength <= CONTENT_GUARD_MIN_STORED_CHARS) return false;

  const nextLength = nextContent?.length ?? 0;
  if (nextLength >= storedLength * CONTENT_GUARD_COLLAPSE_RATIO) return false;

  return scanStarved(signals, nextContent);
}
