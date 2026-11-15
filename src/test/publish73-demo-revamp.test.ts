// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";

/**
 * Publish #73 (owner directive, 2026-11-15): the demo revamp.
 *
 * (a) The ~2-minute scan wait SELLS: ScanningAnimation shows SIX
 * feature cards at once in a grid (bigger icons, avatar-library row on
 * the video card) while the scanner card keeps reporting the TRUTHFUL
 * progress — real steps, real percentage, visually separate from the
 * sell. No fake progress, no hidden rotation.
 * (b) /demo and /demo/br are ONE screen: hero + form + one perks strip
 * + disclaimer; every duplicated section is gone.
 * (c) Full EN / PT-BR parity for everything new (es kept in parity
 * too, per the repo's three-locale standard).
 */

const scanning = readFileSync(
  new URL("../components/landing/ScanningAnimation.tsx", import.meta.url),
  "utf8",
);
const tryDemo = readFileSync(new URL("../pages/TryDemo.tsx", import.meta.url), "utf8");
const demoSite = readFileSync(new URL("../pages/DemoSite.tsx", import.meta.url), "utf8");

const FEATURE_KEYS = [
  "videoAvatar",
  "conversation",
  "dashboard",
  "appointments",
  "warmTransfer",
  "readyFast",
] as const;

const SHORT_PERKS = [
  "perkVoicemailShort",
  "perkFastShort",
  "perkCaptureShort",
  "perkBookingsShort",
  "perkLiveAvatarShort",
] as const;

const LOCALES = [["en", en], ["es", es], ["pt-BR", pt]] as const;

describe("Publish #73 — scan-wait feature grid", () => {
  it("renders all six feature cards at once in a responsive grid", () => {
    expect(scanning).toContain("const featureCards");
    expect(scanning).toContain("lg:grid-cols-3");
    expect(scanning).toContain("featureCards.map");
    // Bigger visual weight than the old deck: large icon tiles.
    expect(scanning).toContain("h-11 w-11");
    expect(scanning).toContain("h-6 w-6");
    // The highlight cycles; cards are never swapped out of the DOM.
    expect(scanning).toContain("activeFeature");
    expect(scanning).not.toContain("currentBenefit");
    expect(scanning).toContain("scan.benefits.${key}.headline");
  });

  it("the video card carries the avatar-library row with the approved faces", () => {
    // Aspen = the current approved portrait (same asset as the hero).
    expect(scanning).toContain("aspen-video-frame-final.webp");
    // Frank + Sara = their Simli catalog faces.
    expect(scanning).toContain("b3f85f7f-57ea-4f24-b1f6-a57229b4fae1.webp");
    expect(scanning).toContain("f735e62c-dce7-4c0b-8e85-1c7e21774c45.webp");
    expect(scanning).toContain("AVATAR_ROW");
    expect(scanning).toContain("scan.benefits.videoAvatar.avatarsNote");
  });

  it("keeps the truthful progress block intact and separate from the sell", () => {
    // Real step logic + real progress math are untouched…
    expect(scanning).toContain("pendingScanProgress");
    expect(scanning).toContain("scan.steps.${activeStep.key}.label");
    expect(scanning).toContain("scan.progress");
    // …and the feature grid is headed as its own block.
    expect(scanning).toContain("scan.featuresTitle");
    expect(scanning.indexOf("scan.featuresTitle")).toBeGreaterThan(
      scanning.indexOf("scan.progress"),
    );
  });

  it("scan step details describe the work, not a second sales pitch", () => {
    // The duplication Ron flagged: step details used to repeat the
    // cards' claims. They are factual progress lines now, in all locales.
    for (const [name, locale] of LOCALES) {
      const steps = locale.scan.steps as Record<string, { detail: string }>;
      const details = Object.values(steps).map((s) => s.detail).join(" ");
      expect(details, `${name}.scan.steps`).not.toMatch(/never miss|turn visitors into|hot leads|siendo capturados|transformam visitantes|conectados com uma pessoa/i);
    }
  });

  it("has full catalog parity for the deck, the grid heading and the short perks", () => {
    for (const [name, locale] of LOCALES) {
      expect(Object.keys(locale.scan.benefits), `${name}.scan.benefits`).toEqual([...FEATURE_KEYS]);
      expect(locale.scan.featuresTitle.trim().length, `${name}.scan.featuresTitle`).toBeGreaterThan(0);
      for (const key of FEATURE_KEYS) {
        const card = (locale.scan.benefits as unknown as Record<string, { headline: string; body: string }>)[key];
        expect(card.headline.trim().length, `${name}.${key}.headline`).toBeGreaterThan(0);
        expect(card.body.trim().length, `${name}.${key}.body`).toBeGreaterThan(0);
      }
      for (const key of SHORT_PERKS) {
        const value = (locale.tryDemo as unknown as Record<string, string>)[key];
        expect(typeof value, `${name}.tryDemo.${key}`).toBe("string");
        expect(value.trim().length, `${name}.tryDemo.${key}`).toBeGreaterThan(0);
      }
    }
    // pt-BR and es are real translations of the new copy, not copies.
    expect(pt.scan.benefits.conversation.headline).not.toBe(en.scan.benefits.conversation.headline);
    expect(pt.scan.benefits.dashboard.headline).not.toBe(en.scan.benefits.dashboard.headline);
    expect(pt.scan.benefits.readyFast.headline).not.toBe(en.scan.benefits.readyFast.headline);
    expect(es.scan.benefits.conversation.headline).not.toBe(en.scan.benefits.conversation.headline);
    expect(pt.tryDemo.perkFastShort).not.toBe(en.tryDemo.perkFastShort);
  });

  it("the dashboard card never promises recordings, in any locale", () => {
    // The approved realtor FAQ says recordings are not yet available;
    // the card sells transcripts instead — in every language.
    expect(en.scan.benefits.dashboard.body).not.toMatch(/recording/i);
    expect(pt.scan.benefits.dashboard.body).not.toMatch(/gravaç/i);
    expect(es.scan.benefits.dashboard.body).not.toMatch(/grabacion/i);
  });
});

describe("Publish #73 — one-screen demo page", () => {
  it("keeps exactly the first-screen essentials", () => {
    expect(tryDemo).toContain("tryDemo.heroHeadline");
    expect(tryDemo).toContain("tryDemo.priceStrip");
    expect(tryDemo).toContain("<DemoIntakePanel");
    expect(tryDemo).toContain("tryDemo.disclaimer");
    expect(tryDemo).toContain("<DemoReassuranceStrip />");
    // The /demo/br variant still gets its Brazilian examples above the form.
    expect(tryDemo).toContain('variant === "br" && <BrazilExamples />');
  });

  it("dropped every duplicated / below-the-fold section", () => {
    for (const gone of [
      "<Accordion",
      "<RankAuditPanel",
      "<TeamSection",
      "demo-how-title",
      "demo-benefits-title",
      "demo-faq-title",
      "tryDemo.trusted",
      "tryDemo.examplesTitle",
      "tryDemo.rankTitle",
    ]) {
      expect(tryDemo, gone).not.toContain(gone);
    }
  });

  it("the scan loading screen can scroll on small screens instead of clipping", () => {
    // The feature grid made the scan screen taller; DemoSite's loading
    // shell must let mobile scroll it (desktop still fits one screen).
    expect(demoSite).toContain("overflow-y-auto");
    expect(demoSite).toContain("min-h-[100dvh] bg-background");
  });
});
