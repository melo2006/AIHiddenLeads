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
 *
 * Publish #73 (owner directive, 2026-11-15) superseded the below-the-fold
 * structure: the page is now ONE screen — hero + form + a single compact
 * perks strip + disclaimer — and the examples accordion, the Maps rank
 * grid, the team section, how-it-works, the trust strip and the FAQ
 * accordion no longer render here (the rank audit lives inside the demo
 * itself; the Q&A lives in the prerendered SEO head + FAQ schema, whose
 * catalog parity seo-head.test.ts still pins). The two structural tests
 * below were rewritten to pin the new shape.
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

  it("renders no below-the-fold sections anymore (Publish #73 one-screen page)", () => {
    // The examples accordion, rank grid, team section, how-it-works and
    // FAQ accordion are gone from /demo; the data behind them is intact
    // (the 4 wired examples still exist for the surfaces that use them).
    expect(tryDemo).not.toContain("<Accordion");
    expect(tryDemo).not.toContain("<RankAuditPanel");
    expect(tryDemo).not.toContain("<TeamSection");
    expect(tryDemo).not.toContain("rankAuditExamples");
    expect(tryDemo).not.toContain("demo-how-title");
    expect(tryDemo).not.toContain("demo-benefits-title");
    expect(tryDemo).not.toContain("faqItems");
    expect(rankAuditExamples).toHaveLength(4);
  });

  it("states the selling points exactly once, in the compact perks strip", () => {
    // The strip renders the Short labels; the long perk sentences are
    // no longer rendered anywhere on the page (no repeated claims).
    for (const shortKey of ["perkVoicemailShort", "perkFastShort", "perkCaptureShort", "perkBookingsShort", "perkLiveAvatarShort"]) {
      expect(tryDemo).toContain(`"${shortKey}"`);
    }
    for (const longKey of ["perkVoicemail", "perkFast", "perkCapture", "perkBookings", "perkLiveAvatar"]) {
      expect(tryDemo).not.toContain(`"${longKey}"`);
    }
    expect(tryDemo).not.toContain("tryDemo.trusted");
    expect(tryDemo).not.toContain("tryDemo.smsNote");
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
