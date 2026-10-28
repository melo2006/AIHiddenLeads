import { describe, it, expect } from "vitest";
import { renderGreeting, nameFromUrl, stepReady, faqKnowledge, EMPTY } from "./wizardModel";

describe("setup wizard rules", () => {
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
