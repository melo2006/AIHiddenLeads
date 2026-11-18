import { describe, it, expect } from "vitest";
import { renderGreeting, renderTemplate, nameFromUrl, stepReady, faqKnowledge, industryName, SPECIALTIES, EMPTY, BUILT_IN_VARIABLES, GREETING_TEMPLATES, greetingStyles, customVariableNameValid, summarizeForSpeech, spliceText, parseCsvColumns, compiledKnowledgeChars, KNOWLEDGE_CAP_CHARS, STEPS } from "./wizardModel";

describe("setup wizard rules", () => {
  it('uses the custom industry instead of Other', () => {
    expect(industryName({ industry: 'Other', customIndustry: 'Industrial filtration' })).toBe('Industrial filtration');
    expect(stepReady(0, { ...EMPTY, businessName: 'Filter Works', industry: 'Other' })).toBe(false);
    expect(stepReady(0, { ...EMPTY, businessName: 'Filter Works', industry: 'Other', customIndustry: 'Industrial filtration' })).toBe(true);
  });
  it('allows optional specialties for any industry without requiring a website', () => {
    expect(stepReady(0, { ...EMPTY, businessName: 'Cold Works', industry: 'HVAC', subNiche: 'Commercial refrigeration' })).toBe(true);
    expect(SPECIALTIES.HVAC).toContain('Commercial refrigeration');
  });
  it("fills greeting placeholders by time of day", () => {
    expect(renderGreeting({ greeting: "{timeGreeting}! I'm {agentName} with {businessName}.", name: "Aspen", businessName: "Apex" }, 9))
      .toBe("Good morning! I'm Aspen with Apex.");
  });
  it("guesses a business name from the website address", () => {
    expect(nameFromUrl("https://www.apex-roofing.com/about")).toBe("Apex Roofing");
  });
  it("needs a business name or a website-derived name before leaving step 1", () => {
    expect(stepReady(0, EMPTY)).toBe(false);
    expect(stepReady(0, { ...EMPTY, businessName: "Apex" })).toBe(true);
  });
  it("allows website-only setup without overwriting the provided business name", () => {
    expect(stepReady(0, { ...EMPTY, websiteUrl: "https://www.bankunited.com" })).toBe(true);
    expect(nameFromUrl("https://www.bankunited.com")).toBe("Bankunited");
  });
  it("skips half-filled FAQs", () => {
    expect(faqKnowledge([{ q: "Hours?", a: "9-5" }, { q: "Empty", a: "" }])).toBe("Q: Hours?\nA: 9-5");
  });
});

import { askLabel, isAskLabel, labelOptions, toggleSentence, sentenceAccepted } from "./wizardModel";
describe("suggestion sentence toggling", () => {
  const s1 = "We offer drain cleaning and unclogging.";
  const s2 = "We install and repair water heaters.";
  it("appends an accepted sentence on its own line and removes exactly it on untick", () => {
    expect(toggleSentence("", s1, true)).toBe(s1);
    const both = toggleSentence(s1, s2, true);
    expect(both).toBe(`${s1}\n${s2}`);
    expect(toggleSentence(both, s1, false)).toBe(s2);
    expect(toggleSentence(both, s2, false)).toBe(s1);
  });
  it("is idempotent and never duplicates", () => {
    expect(toggleSentence(s1, s1, true)).toBe(s1);
    expect(toggleSentence(s1, s2, false)).toBe(s1);
  });
  it("preserves the owner's other paragraphs and their rewrites", () => {
    const text = `Our own intro paragraph.\n\n${s1}\n\nAnother paragraph the owner wrote.`;
    expect(toggleSentence(text, s1, false)).toBe("Our own intro paragraph.\n\nAnother paragraph the owner wrote.");
    const rewritten = "We offer drain cleaning, fast.";
    expect(sentenceAccepted(rewritten, s1)).toBe(false);
    expect(toggleSentence(rewritten, s1, false)).toBe(rewritten);
  });
});

describe("launcher label follows agent name", () => {
  it("uses the renamed agent", () => {
    expect(askLabel("Lucy")).toBe("Ask Lucy");
    expect(labelOptions("Lucy")[0]).toBe("Ask Lucy");
    expect(isAskLabel("Ask Aspen")).toBe(true);
    expect(isAskLabel("Talk to us")).toBe(false);
  });
});

describe("Concept C step order", () => {
  it("runs business, learn, face & voice, review, look, launch", () => {
    expect(STEPS.map((s) => s.id)).toEqual(["business", "learn", "face", "review", "look", "launch"]);
  });
  it("gates the review step (not face & voice) on a real greeting", () => {
    expect(stepReady(3, { ...EMPTY, greeting: "Hi" })).toBe(false);
    expect(stepReady(3, { ...EMPTY, greeting: "Hello there" })).toBe(true);
    expect(stepReady(2, { ...EMPTY, greeting: "Hi" })).toBe(true);
  });
});

describe("Concept C variables", () => {
  it("ships the six built-ins from the brief", () => {
    expect(BUILT_IN_VARIABLES.map((v) => v.token)).toEqual(["timeGreeting", "agentName", "businessName", "callerName", "callerNumber", "todayDate"]);
  });
  it("renders custom variables with the owner's example, never a naked token", () => {
    const s = { name: "Aspen", businessName: "BlueLine", customVariables: [{ id: "1", name: "ticketNumber", label: "Ticket number", source: "call" as const, example: "4821" }] };
    const out = renderTemplate("Your ticket {ticketNumber} is with {agentName} at {businessName}.", s, 9);
    expect(out).toBe("Your ticket 4821 is with Aspen at BlueLine.");
    expect(out).not.toContain("{");
  });
  it("renders the new built-ins with honest samples and strips unknown tokens", () => {
    const out = renderTemplate("Hi {callerName} ({callerNumber}) on {todayDate} — ref {mystery}", { name: "Aspen", businessName: "B" }, 9);
    expect(out).toContain("Jordan");
    expect(out).toContain("+1 (555) 010-2030");
    expect(out).not.toContain("{");
  });
  it("validates custom variable names and refuses built-in shadowing", () => {
    expect(customVariableNameValid("ticketNumber")).toBe(true);
    expect(customVariableNameValid("Ticket")).toBe(false);
    expect(customVariableNameValid("has space")).toBe(false);
    expect(customVariableNameValid("callerName")).toBe(false);
    expect(customVariableNameValid("a")).toBe(false);
  });
  it("templates and style cards only use known variables", () => {
    const known = new Set(BUILT_IN_VARIABLES.map((v) => v.token));
    for (const text of [...GREETING_TEMPLATES.map((t) => t.text), ...greetingStyles().map((g) => g.text)]) {
      for (const m of text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) expect(known.has(m[1])).toBe(true);
    }
    expect(GREETING_TEMPLATES.map((t) => t.id)).toEqual(["thanks-for-calling", "busy", "after-hours", "warm-welcome", "formal"]);
    expect(greetingStyles().map((g) => g.id)).toEqual(["warm", "professional", "short"]);
  });
});

describe("Concept C field helpers", () => {
  it("splices insertions at the caret", () => {
    expect(spliceText("Hello world", 5, 5, "{agentName}")).toBe("Hello{agentName} world");
    expect(spliceText("Hello world", 6, 11, "there")).toBe("Hello there");
  });
  it("summarizes long text at a sentence boundary under the read-aloud cap", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} explains a service in some detail.`).join(" ");
    const out = summarizeForSpeech(long);
    expect(out.length).toBeLessThanOrEqual(700);
    expect(out.endsWith(".")).toBe(true);
    expect(summarizeForSpeech("Short text.")).toBe("Short text.");
    expect(summarizeForSpeech("--- Wizard FAQs ---\nReal line.")).toBe("Real line.");
  });
  it("parses CSV header columns, respecting quotes", () => {
    expect(parseCsvColumns('MLS #,Address,"Price, USD",Notes\n123,Main St,5,x')).toEqual(["MLS #", "Address", "Price, USD", "Notes"]);
    expect(parseCsvColumns("")).toEqual([]);
    expect(parseCsvColumns("\n\nA,B,A")).toEqual(["A", "B"]);
  });
  it("counts compiled knowledge against the 60,000 cap", () => {
    expect(KNOWLEDGE_CAP_CHARS).toBe(60000);
    expect(compiledKnowledgeChars({ guidance: "abc", serviceAreaText: "de", faqs: [{ q: "Q", a: "A" }], sourcesChars: 10 })).toBe(3 + 2 + "Q: Q\nA: A".length + 10);
  });
});
