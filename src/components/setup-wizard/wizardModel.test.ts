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

import { askLabel, isAskLabel, labelOptions } from "./wizardModel";
describe("launcher label follows agent name", () => {
  it("uses the renamed agent", () => {
    expect(askLabel("Lucy")).toBe("Ask Lucy");
    expect(labelOptions("Lucy")[0]).toBe("Ask Lucy");
    expect(isAskLabel("Ask Aspen")).toBe(true);
    expect(isAskLabel("Talk to us")).toBe(false);
  });
});
