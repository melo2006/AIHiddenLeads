import { describe, it, expect } from "vitest";
import { renderGreeting, nameFromUrl, stepReady, faqKnowledge, industryName, SPECIALTIES, EMPTY } from "./wizardModel";

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
