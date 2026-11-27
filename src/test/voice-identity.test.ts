// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  emptyVoiceIdentity,
  extractVoiceIdentity,
  extractVoiceIdentityFromCopy,
  formatVoiceIdentitySection,
  isEmptyVoiceIdentity,
  parseVoiceIdentitySection,
  sanitizeVoiceIdentity,
  voiceIdentitySection,
  type VoiceIdentity,
} from "../../supabase/functions/_shared/voice-identity";
import {
  businessDemoConfig,
  businessDemoConfigSwapParent,
  SIMULATION_PROMPT,
  SIMULATION_RECEPTIONIST_SEGMENT,
} from "../../supabase/functions/_shared/voice-config";
import { distillKnowledgeBase } from "../../supabase/functions/_shared/kb-distill";

// Per-business voice identity (2026-11-27, Ron's approved build):
// a demo must speak in the BUSINESS'S OWN words — its stated
// greeting/tagline lifted into the opening — not only in shared
// script shapes over its facts. These tests pin the evidence-only
// extraction (every value a verbatim lift from the business's own
// scanned copy), the honestly-empty record for a site that states
// nothing, and the byte-identical fallback composition whenever
// the record is absent or empty.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const sessionSource = read("../../supabase/functions/gemini-session/index.ts");
const scanSource = read("../../supabase/functions/scan-website/index.ts");

const REPEATED_LINE =
  "We treat every pool like it is our own, and we show up when we say we will.";

/** A stored-KB-shaped fixture whose site states a real voice: a
 *  headline beyond the bare name, first-person self-descriptions, a
 *  repeated signature line, "our guests", and a TONE section. */
const KB_WITH_VOICE = [
  "LEARNING COVERAGE: depth 2; 4 primary website pages read; bounded by time and page limits, not the entire website.",
  "",
  "=== HOMEPAGE CONTENT ===",
  "# Splash Pool Service",
  "",
  "## We Bring the Sparkle Back to Your Pool",
  "",
  "We are a family-run team that has cared for pools across Broward County for over twenty years.",
  REPEATED_LINE,
  "Our guests receive a photo report after every single visit, so they always know their pool is ready.",
  "",
  "=== TONE ===",
  "- warm",
  "- family-run",
  "- no-pressure",
  "",
  "=== ADDITIONAL WEBSITE CONTENT ===",
  "SOURCE URL: https://splashpool.example.com/services",
  "## Weekly Cleaning",
  REPEATED_LINE,
  "We send our guests a text the moment the visit is done.",
  "",
  "SOURCE URL: https://splashpool.example.com/about",
  "## About Us",
  REPEATED_LINE,
  "Our guests have trusted the same small crew for years.",
].join("\n");

/** A site that states nothing usable: bare-name headline, third
 *  person only, no tone, no repetition, no customer term. */
const KB_WITHOUT_VOICE = [
  "=== HOMEPAGE CONTENT ===",
  "# Acme Widgets",
  "",
  "Acme Widgets sells industrial widgets and sprockets. The company was founded in 1990 and operates a warehouse in Ohio. Products include gears, sprockets and fasteners for factories nationwide.",
].join("\n");

describe("extraction — evidence only, verbatim lifts", () => {
  it("lifts the stated headline, self-descriptions, tone, signature phrase and customer term", () => {
    const v = extractVoiceIdentity(KB_WITH_VOICE, "Splash Pool Service");
    expect(v.tagline).toBe("We Bring the Sparkle Back to Your Pool");
    expect(v.selfDescriptions).toContain(
      "We are a family-run team that has cared for pools across Broward County for over twenty years.",
    );
    expect(v.toneCues).toEqual(["warm", "family-run", "no-pressure"]);
    expect(v.customerTerms).toEqual(["guests"]);
    expect(v.signaturePhrases.length).toBeGreaterThanOrEqual(1);
    // Every signature phrase is an n-gram of the repeated line —
    // lifted from the copy, never invented.
    const repeatedWords = new Set(REPEATED_LINE.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean));
    for (const phrase of v.signaturePhrases) {
      for (const w of phrase.toLowerCase().split(/\s+/)) expect(repeatedWords.has(w)).toBe(true);
    }
    expect(isEmptyVoiceIdentity(v)).toBe(false);
  });

  it("an explicit Tagline label in the copy wins over the headline", () => {
    const copy = [
      "# Acme Widgets",
      "",
      "Tagline: Widgets that work as hard as you do.",
      "",
      "Acme Widgets sells industrial widgets and sprockets to factories.",
    ].join("\n");
    const v = extractVoiceIdentityFromCopy(copy, "Acme Widgets");
    expect(v.tagline).toBe("Widgets that work as hard as you do.");
  });

  it("a site that states nothing yields the honestly empty record", () => {
    const v = extractVoiceIdentity(KB_WITHOUT_VOICE, "Acme Widgets");
    expect(v).toEqual(emptyVoiceIdentity());
    expect(isEmptyVoiceIdentity(v)).toBe(true);
  });

  it("empty and unstructured input never throws and stays empty", () => {
    expect(extractVoiceIdentity("", "X")).toEqual(emptyVoiceIdentity());
    expect(extractVoiceIdentity("{}", "X")).toEqual(emptyVoiceIdentity());
  });

  it("sanitize drops junk, caps lists and collapses whitespace", () => {
    const v = sanitizeVoiceIdentity({
      tagline: "  A   real   line  ",
      selfDescriptions: ["ok sentence", 42, "", "ok sentence"],
      toneCues: "not-an-array",
      signaturePhrases: [],
      customerTerms: ["guests", "guests", "patients"],
    });
    expect(v.tagline).toBe("A real line");
    expect(v.selfDescriptions).toEqual(["ok sentence"]);
    expect(v.toneCues).toEqual([]);
    expect(v.customerTerms).toEqual(["guests", "patients"]);
    expect(sanitizeVoiceIdentity(undefined)).toEqual(emptyVoiceIdentity());
    expect(sanitizeVoiceIdentity("nope")).toEqual(emptyVoiceIdentity());
  });
});

describe("the stored KB section — format / parse round trip", () => {
  const record: VoiceIdentity = {
    tagline: "We Bring the Sparkle Back to Your Pool",
    selfDescriptions: [
      "We are a family-run team that has cared for pools across Broward County for over twenty years.",
    ],
    toneCues: ["warm", "family-run", "no-pressure"],
    signaturePhrases: ["Treat Every Pool Like It Is"],
    customerTerms: ["guests"],
  };

  it("round-trips losslessly through the stored section", () => {
    const blob = ["=== SERVICES OFFERED ===", "- Pool cleaning", "", formatVoiceIdentitySection(record), "", "=== HOMEPAGE CONTENT ===", "# Splash Pool Service"].join("\n");
    expect(parseVoiceIdentitySection(blob)).toEqual(record);
  });

  it("the empty record formats to no section at all", () => {
    expect(formatVoiceIdentitySection(emptyVoiceIdentity())).toBe("");
    expect(parseVoiceIdentitySection(KB_WITH_VOICE)).toBeNull();
  });

  it("a stored section wins over fresh extraction at composition time", () => {
    const stored: VoiceIdentity = { ...record, tagline: "The Stored Line Wins Every Time" };
    const blob = [KB_WITH_VOICE, "", formatVoiceIdentitySection(stored)].join("\n");
    expect(extractVoiceIdentity(blob, "Splash Pool Service").tagline).toBe("The Stored Line Wins Every Time");
  });

  it("the KB distiller carries the stored section verbatim as structured content", () => {
    const filler = Array.from({ length: 320 }, (_, i) => `Page copy line ${i} about pool cleaning visits, skimming, brushing and filter care.`).join("\n");
    const big = [
      "=== GENERATED BUSINESS SUMMARY ===",
      formatVoiceIdentitySection(record),
      "",
      "=== HOMEPAGE CONTENT ===",
      filler,
    ].join("\n");
    const d = distillKnowledgeBase(big);
    expect(d.distilled).toBe(true);
    expect(d.brief).toContain("=== VOICE IDENTITY ===");
    expect(d.brief).toContain("We Bring the Sparkle Back to Your Pool");
  });
});

describe("composition — businessDemoConfig is the plug-in point", () => {
  const record = extractVoiceIdentity(KB_WITH_VOICE, "Splash Pool Service");

  it("a present record weaves the identity section into the prompt and stamps the config", () => {
    const cfg = businessDemoConfig("Splash Pool Service", "knowledge", { voiceIdentity: record }) as Record<string, unknown>;
    const prompt = String(cfg.systemPrompt);
    expect(prompt).toContain("THE BUSINESS'S OWN VOICE");
    expect(prompt).toContain('"We Bring the Sparkle Back to Your Pool"');
    expect(prompt).toContain("ITS OWN STATED LINE");
    expect(prompt).toContain('its "guests"');
    // The section sits ahead of the simulation material, and the
    // simulation prompt itself is untouched.
    expect(prompt.indexOf("THE BUSINESS'S OWN VOICE")).toBeLessThan(prompt.indexOf("THE SIMULATION ENTRY"));
    expect(prompt).toContain(SIMULATION_PROMPT);
    expect(cfg.voiceIdentity).toEqual(record);
  });

  it("no record (or an empty one) → byte-identical composition, no stamp", () => {
    const baseline = businessDemoConfig("Splash Pool Service", "knowledge");
    const withEmpty = businessDemoConfig("Splash Pool Service", "knowledge", { voiceIdentity: emptyVoiceIdentity() });
    const withJunk = businessDemoConfig("Splash Pool Service", "knowledge", { voiceIdentity: { tagline: 42 } });
    expect(withEmpty.systemPrompt).toBe(baseline.systemPrompt);
    expect(withJunk.systemPrompt).toBe(baseline.systemPrompt);
    expect("voiceIdentity" in withEmpty).toBe(false);
    expect("voiceIdentity" in baseline).toBe(false);
    expect(String(baseline.systemPrompt)).not.toContain("OWN VOICE");
  });

  it("the swap parent carries the section too — and still excludes the receptionist segment", () => {
    const cfg = businessDemoConfigSwapParent("Splash Pool Service", "knowledge", { voiceIdentity: record });
    const prompt = String(cfg.systemPrompt);
    expect(prompt).toContain("THE BUSINESS'S OWN VOICE");
    expect(prompt).toContain('"We Bring the Sparkle Back to Your Pool"');
    expect(prompt).not.toContain(SIMULATION_RECEPTIONIST_SEGMENT);
    expect((cfg as Record<string, unknown>).voiceIdentity).toEqual(record);
    const baseline = businessDemoConfigSwapParent("Splash Pool Service", "knowledge");
    expect(businessDemoConfigSwapParent("Splash Pool Service", "knowledge", { voiceIdentity: emptyVoiceIdentity() }).systemPrompt)
      .toBe(baseline.systemPrompt);
  });

  it("voiceIdentitySection is empty for an empty record and names only evidenced lines", () => {
    expect(voiceIdentitySection(emptyVoiceIdentity(), "Acme Widgets")).toBe("");
    const onlyTagline = voiceIdentitySection({ ...emptyVoiceIdentity(), tagline: "Widgets that work as hard as you do." }, "Acme Widgets");
    expect(onlyTagline).toContain("ITS OWN STATED LINE");
    expect(onlyTagline).not.toContain("HOW IT DESCRIBES ITSELF");
    expect(onlyTagline).not.toContain("PHRASES IT USES");
  });
});

describe("wiring — scan stores it, gemini-session composes from it", () => {
  it("scan-website extracts from the raw copy into the structured knowledge", () => {
    expect(scanSource).toContain("extractVoiceIdentityFromCopy(voiceSourceText, profile.businessName, profile.toneKeywords)");
    expect(scanSource).toContain("voiceSourceText: [homepageMarkdown, combinedPageContent, secondaryContent].filter(Boolean).join('\\n\\n')");
    expect(scanSource).toContain("voiceSourceText: existingContent");
  });

  it("gemini-session extracts from the fetched knowledge and passes it through the identity record", () => {
    expect(sessionSource).toContain("const voiceIdentity=extractVoiceIdentity(knowledge,businessName);");
    expect(sessionSource).toContain("const demoIdentity={...(published ?? {}),voiceIdentity};");
    expect(sessionSource).toContain("businessDemoConfig(businessName,kbSlim.sessionKnowledge,demoIdentity)");
  });

  it("gemini-session rebuilds the section for Sara's segment from the parent's stamp", () => {
    expect(sessionSource).toContain("voiceIdentitySection(sanitizeVoiceIdentity((parent as Record<string,unknown>).voiceIdentity),businessName)");
    expect(sessionSource).toContain("const segmentLayer=[listingsLayer?.layer, practiceLayer, voiceIdentityLayer].filter(Boolean).join('\\n');");
  });
});
