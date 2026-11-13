// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";
import { rankAuditExamples } from "../lib/rankAuditExamples";

/**
 * Structural guards for the /demo landing redesign (owner spec, 2026-11-08):
 * hero-first layout, the gate flow untouched, the LIVE-avatar
 * differentiation copy, and the live homepage widget on the landing only.
 */

const tryDemo = readFileSync(new URL("../pages/TryDemo.tsx", import.meta.url), "utf8");
const intake = readFileSync(new URL("../components/landing/DemoIntakePanel.tsx", import.meta.url), "utf8");
const demoSite = readFileSync(new URL("../pages/DemoSite.tsx", import.meta.url), "utf8");

const NEW_KEYS = [
  "heroHeadline", "heroTagline", "aspenBubble", "priceStrip", "askAspen",
  "benefitsTitle", "perkVoicemail", "perkFast", "perkCapture", "perkBookings",
  "perkLiveAvatar", "smsNote", "howTitle", "stepEnter", "stepLearn",
  "stepTalk", "examplesTitle", "examplesHint", "rankTitle",
] as const;

describe("/demo landing redesign", () => {
  it("renders the new hero (slogan, bubble, price strip, ask-Aspen) from i18n keys", () => {
    for (const key of ["heroHeadline", "heroTagline", "aspenBubble", "priceStrip", "askAspen"]) {
      expect(tryDemo).toContain(`tryDemo.${key}`);
    }
  });

  it("dropped the six info cards that buried the form", () => {
    expect(tryDemo).not.toContain("tryDemo.benefits.");
    expect(tryDemo).not.toContain("PhoneForwarded");
  });

  it("puts the examples in a collapsed-by-default accordion driven by rankAuditExamples", () => {
    expect(tryDemo).toContain("<Accordion");
    expect(tryDemo).toContain("collapsible");
    expect(tryDemo).not.toContain('defaultValue="examples"');
    expect(tryDemo).toContain("rankAuditExamples.map");
    // The 4 wired examples stay wired; the accordion grid wraps for up to 10.
    expect(rankAuditExamples).toHaveLength(4);
    expect(rankAuditExamples.map((e) => e.name)).toEqual(
      expect.arrayContaining([
        "Willing Cleaning Company",
        "ARZ Machining Inc.",
        "Seal-Tec",
        expect.stringContaining("Shobu"),
      ]),
    );
  });

  it("keeps the rank grid on the page, below the examples", () => {
    expect(tryDemo).toContain("<RankAuditPanel");
    expect(tryDemo.indexOf("<RankAuditPanel")).toBeGreaterThan(tryDemo.indexOf("examplesTitle"));
  });

  it("keeps the verified-demo gate plumbing identical (toggle, resume, prefill, gate params)", () => {
    expect(tryDemo).toContain("loadDemoResume");
    expect(tryDemo).toContain('params.set("gate", "1")');
    expect(tryDemo).toContain('searchParams.get("url")');
    expect(intake).toContain("DEMO_TEST_TOGGLE");
    expect(intake).toContain("shouldVerifyDemo");
    expect(intake).toContain("DEMO_CONSENT_DISCLOSURE");
  });

  it("mounts the live homepage widget on the landing — and nowhere in the simulation page", () => {
    expect(tryDemo).toContain("<GeminiAgentWidget floating />");
    expect(tryDemo).toContain('"open-homepage-aspen"');
    expect(demoSite).not.toContain("GeminiAgentWidget");
  });

  it("fixes the intake avatar distortion without the widget-sized portrait component", () => {
    expect(intake).not.toContain("<PersonPortrait");
    expect(intake).toContain("aspen-video-frame-final.webp");
    expect(intake).toContain("object-cover object-top");
    expect(intake).toContain("Show me my talking website");
    expect(intake).toContain("Your site is never changed");
  });

  it("carries the approved differentiation line (never an absolute 'only one')", () => {
    expect(en.tryDemo.perkLiveAvatar).toContain("Not just another voice AI");
    expect(en.tryDemo.perkLiveAvatar).toContain("Almost nobody else can give you that.");
    expect(en.tryDemo.perkLiveAvatar).not.toContain("the only");
  });

  it("keeps the price strip evergreen (no calendar dates)", () => {
    expect(en.tryDemo.priceStrip).toContain("$99/mo");
    expect(en.tryDemo.priceStrip).toContain("the permanent price, no intro discount");
    expect(en.tryDemo.priceStrip).toContain("free for your first month");
    expect(en.tryDemo.priceStrip).not.toContain("50% off");
    expect(en.tryDemo.priceStrip).not.toMatch(/november|december|january|20\d\d/i);
  });

  it("has every new tryDemo key in all three locales, faithfully non-empty", () => {
    for (const key of NEW_KEYS) {
      for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
        const value = (locale.tryDemo as unknown as Record<string, unknown>)[key];
        expect(typeof value, `${name}.tryDemo.${key}`).toBe("string");
        expect((value as string).trim().length, `${name}.tryDemo.${key}`).toBeGreaterThan(0);
      }
      // es/pt are real translations, not copies of the English string.
      expect((es.tryDemo as unknown as Record<string, string>)[key]).not.toBe(en.tryDemo[key]);
      expect((pt.tryDemo as unknown as Record<string, string>)[key]).not.toBe(en.tryDemo[key]);
    }
  });
});
