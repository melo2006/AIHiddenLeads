// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KB_BRIEF_MAX_CHARS,
  composeSessionKnowledge,
  distillKnowledgeBase,
  estimateTokens,
  kbSlimEnabled,
  searchKnowledgeBase,
} from "../../supabase/functions/_shared/kb-distill";
import { businessDemoConfig } from "../../supabase/functions/_shared/voice-config";

// Publish #85b — KB SLIM. Gemini Live re-bills the whole session
// context every turn, and the stored demo KB is raw Firecrawl page
// markdown: measured 2026-11-15, the two big pinned examples sit at
// the 160,000-char cap (~40k tokens), ~49% of it raw URLs. These
// tests pin the distiller (brief in the prompt, full text behind
// the lookup), the flag-off byte-identity of session composition,
// and the passthrough of small KBs. Fixtures are synthetic but
// shaped exactly like scan-website's stored format.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const sessionSource = read("../../supabase/functions/gemini-session/index.ts");
const proxySource = read("../../supabase/functions/gemini-live-proxy/index.ts");

const envOn = (name: string) => (name === "KB_SLIM_BRIEF_ENABLED" ? "1" : undefined);
const envOff = () => undefined;

const NAV =
  "- [Meet The Team](https://example-realty.com/about) - [Our Properties](https://example-realty.com/properties) - [My Search Portal](https://example-realty.com/search) - [Seller's Services](https://example-realty.com/sellers) - [Contact Us](https://example-realty.com/contact)";
const NAV_CLEAN = "My Search Portal";
const FOOTER =
  "© 2026 Example Realty Group. All rights reserved. Equal Housing Opportunity. Broker licensed in Florida.";

/** A stored-KB-shaped fixture: structured summary + raw page dumps
 *  with repeated nav/footer, CDN image URLs, and unique filler
 *  listings, in scan-website's exact section format. */
function bigKb(): string {
  const listings: string[] = [];
  for (let i = 0; i < 320; i++) {
    listings.push(
      `${100 + i} Palm Avenue Unit ${i}, Miami, FL 33133 — ${3 + (i % 4)} bed, ${2 + (i % 3)} bath residence listed at $${(850 + i * 7).toLocaleString("en-US")},000 with a private pool, summer kitchen and two-car garage.`,
    );
  }
  const homepage = [
    `[![Example Realty](https://media-production.lp-cdn.com/cdn-cgi/image/format=auto,quality=85/https://media-production.lp-cdn.com/media/abc123)](https://example-realty.com/) ${NAV}`,
    "# $241+ Million in Total Closed Sales Volume in 2025",
    "Find your luxury home in South Florida. Call us at (305) 555-0147 or write to hello@example-realty.com for a private consultation.",
    ...listings.slice(0, 90),
    FOOTER,
  ].join("\n");
  const page = (url: string, title: string, body: string[]) =>
    [`SOURCE URL: ${url}`, `## ${title}`, NAV, ...body, FOOTER].join("\n");
  const additional = [
    page("https://example-realty.com/about", "About Our Team", [
      "## Meet The Team",
      "Broker Ana Example founded the group in 2009 and leads a team of twelve agents across Miami-Dade and Broward.",
      ...listings.slice(90, 200),
    ]),
    page("https://example-realty.com/faq", "Questions", [
      "## Do you offer free home valuations?",
      "Yes. Every valuation includes a full comparable-sales review of your neighborhood and a written pricing recommendation, with no obligation to list with us.",
      ...listings.slice(200, 290),
    ]),
    page("https://example-realty.com/ponce-davis", "Ponce Davis Office", [
      "The Ponce Davis office keeps Saturday hours from 9 AM to 2 PM for walk-in sellers.",
      ...listings.slice(290),
    ]),
  ].join("\n\n");
  const summary = [
    "BUSINESS NAME: Example Realty Group",
    "DETECTED NICHE: realtors",
    "SERVICE AREA: South Florida",
    "SUMMARY: A luxury real estate team serving South Florida buyers and sellers.",
    "WEBSITE: https://example-realty.com/",
    "",
    "=== SERVICES OFFERED ===",
    "- Buyer and seller representation",
    "- Luxury waterfront marketing",
    "",
    "=== FREQUENTLY ASKED QUESTIONS ===",
    "Q: How quickly can I book a showing?",
    "",
    "=== CALL GOALS ===",
    "- Answer questions clearly",
  ].join("\n");
  return [
    "LEARNING COVERAGE: depth 1; 12 primary website pages read; bounded by time and page limits, not the entire website.",
    "",
    "=== HOMEPAGE CONTENT ===",
    homepage,
    "",
    "=== ADDITIONAL WEBSITE CONTENT ===",
    additional,
    "",
    "=== GENERATED BUSINESS SUMMARY ===",
    summary,
  ].join("\n");
}

describe("kbSlimEnabled", () => {
  it("accepts the truthy spellings and nothing else", () => {
    for (const v of ["1", "true", "TRUE", "on", "yes"]) {
      expect(kbSlimEnabled(() => v)).toBe(true);
    }
    for (const v of ["0", "false", "", "enabled"]) {
      expect(kbSlimEnabled(() => v)).toBe(false);
    }
    expect(kbSlimEnabled(() => undefined)).toBe(false);
    expect(kbSlimEnabled(() => null)).toBe(false);
  });
});

describe("composeSessionKnowledge — flag off and passthrough stay byte-identical", () => {
  it("flag off returns the input untouched with NO extra keys, even for a huge KB", () => {
    const kb = bigKb();
    const composed = composeSessionKnowledge(kb, envOff);
    expect(composed.sessionKnowledge).toBe(kb);
    expect(Object.keys(composed)).toEqual(["sessionKnowledge"]);
  });

  it("flag on still passes a tiny KB through whole, byte for byte", () => {
    const kb = "=== SERVICES OFFERED ===\n- Consultations\n- Follow-up care";
    const composed = composeSessionKnowledge(kb, envOn);
    expect(composed.sessionKnowledge).toBe(kb);
    expect(Object.keys(composed)).toEqual(["sessionKnowledge"]);
  });

  it("a KB that is nearly all structured summary is not worth distilling", () => {
    const services = Array.from({ length: 400 }, (_, i) => `- Unique service offering number ${i} with its own description`).join("\n");
    const kb = `BUSINESS NAME: Service Heavy Co\n\n=== SERVICES OFFERED ===\n${services}`;
    expect(kb.length).toBeGreaterThan(12_000);
    const d = distillKnowledgeBase(kb);
    expect(d.distilled).toBe(false);
    expect(d.brief).toBe(kb);
  });
});

describe("distillKnowledgeBase — the big boilerplate KB", () => {
  const kb = bigKb();
  const d = distillKnowledgeBase(kb);

  it("distills and cuts at least 55% of the fixture (Martinez measured 64% live)", () => {
    expect(d.distilled).toBe(true);
    expect(d.briefChars).toBeLessThanOrEqual(KB_BRIEF_MAX_CHARS);
    expect(d.briefChars).toBeLessThanOrEqual(Math.floor(kb.length * 0.42));
    expect(estimateTokens(d.brief)).toBeLessThan(estimateTokens(kb) * 0.42);
  });

  it("keeps every structured fact the demos rely on", () => {
    expect(d.brief).toContain("BUSINESS NAME: Example Realty Group");
    expect(d.brief).toContain("SERVICE AREA: South Florida");
    expect(d.brief).toContain("Luxury waterfront marketing");
    expect(d.brief).toContain("How quickly can I book a showing?");
    expect(d.brief).toContain("$241+ Million in Total Closed Sales Volume in 2025");
    expect(d.brief).toContain("Ana Example founded the group in 2009");
  });

  it("extracts contact facts, the page index, and on-site Q&A answers", () => {
    expect(d.brief).toContain("=== CONTACT DETAILS FROM THE SITE ===");
    expect(d.brief).toContain("(305) 555-0147");
    expect(d.brief).toContain("hello@example-realty.com");
    expect(d.brief).toContain("=== SITE PAGES ===");
    expect(d.brief).toContain("https://example-realty.com/ponce-davis");
    expect(d.brief).toContain("=== QUESTIONS ANSWERED ON THE SITE ===");
    expect(d.brief).toContain("Do you offer free home valuations?");
    expect(d.brief).toContain("comparable-sales review");
  });

  it("strips the URL noise that was half the live KB", () => {
    expect(d.brief).not.toContain("lp-cdn");
    expect(d.brief).not.toContain("cdn-cgi");
    expect(d.brief).not.toContain("media-production");
  });

  it("dedupes the nav and footer repeated on every page", () => {
    expect(d.brief.split(NAV_CLEAN).length - 1).toBe(1);
    expect(d.brief.split("Equal Housing Opportunity").length - 1).toBe(1);
  });

  it("tells the model the full text is searchable via the lookup tool", () => {
    expect(d.brief).toContain("lookup_business_detail");
  });

  it("a business with no on-site Q&A gets no Q&A section and no crash", () => {
    const noFaq = bigKb().replace(/## Do you offer free home valuations\?[\s\S]*?obligation to list with us\./, "Our process is simple and transparent.");
    const dd = distillKnowledgeBase(noFaq);
    expect(dd.distilled).toBe(true);
    expect(dd.brief).not.toContain("=== QUESTIONS ANSWERED ON THE SITE ===");
  });
});

describe("searchKnowledgeBase — the lookup tier", () => {
  const kb = bigKb();
  const d = distillKnowledgeBase(kb);

  it("finds the deep fact the elastic budget trimmed out of the brief", () => {
    expect(d.brief).not.toContain("Saturday hours from 9 AM to 2 PM");
    const found = searchKnowledgeBase(kb, "Ponce Davis Saturday hours");
    expect(found.passages.length).toBeGreaterThan(0);
    expect(found.passages[0].source).toContain("ponce-davis");
    expect(found.passages.map((p) => p.text).join(" ")).toContain("Saturday hours");
  });

  it("caps passages and total size — a lookup joins the billed context", () => {
    const found = searchKnowledgeBase(kb, "Palm Avenue residence pool garage");
    expect(found.passages.length).toBeLessThanOrEqual(3);
    expect(found.passages.reduce((a, p) => a + p.text.length, 0)).toBeLessThanOrEqual(3_600);
  });

  it("returns nothing for a topic the site never mentions", () => {
    expect(searchKnowledgeBase(kb, "helicopter rental submarine tours").passages).toEqual([]);
    expect(searchKnowledgeBase(kb, "the and for").passages).toEqual([]);
    expect(searchKnowledgeBase("", "anything").passages).toEqual([]);
  });
});

describe("composition wiring (source pins)", () => {
  it("gemini-session composes through composeSessionKnowledge and stamps the lookup keys only when armed", () => {
    expect(sessionSource).toContain("composeSessionKnowledge(knowledge,(n)=>Deno.env.get(n))");
    expect(sessionSource).toContain("config.kbLookup=true");
    expect(sessionSource).toContain("config.kbFullText=kbSlim.kbFullText");
    // The flag-off path must stay the plain call it always was.
    expect(sessionSource).toContain("businessDemoConfig(businessName,kbSlim.sessionKnowledge");
  });

  it("the proxy declares and answers lookup_business_detail only on stamped sessions", () => {
    expect(proxySource).toContain("config.kbLookup === true && typeof config.kbFullText === 'string'");
    expect(proxySource).toContain("name:'lookup_business_detail'");
    expect(proxySource).toContain("searchKnowledgeBase(config.kbFullText, query)");
  });

  it("businessDemoConfig with the raw KB is unchanged (the pre-#85b composition)", () => {
    const kb = bigKb();
    const config = businessDemoConfig("Example Realty Group", kb);
    expect(config.sourceKnowledge).toBe(kb.slice(0, 160000));
  });

  it("businessDemoConfig with a composed brief carries the brief, not the dumps", () => {
    const kb = bigKb();
    const composed = composeSessionKnowledge(kb, envOn);
    expect(composed.kbLookup).toBe(true);
    expect(composed.kbFullText).toBe(kb);
    const config = businessDemoConfig("Example Realty Group", composed.sessionKnowledge);
    expect(config.sourceKnowledge).toBe(composed.sessionKnowledge);
    expect(config.sourceKnowledge.length).toBeLessThan(kb.length * 0.42);
  });
});
