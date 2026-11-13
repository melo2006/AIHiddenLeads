// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";

/**
 * Copy-refresh guards (Ron's direction, 2026-11-13).
 *
 * Job A — the demo build-wait flashcard deck (scan.benefits, rotated by
 * ScanningAnimation while a demo builds) predated the video avatar and
 * carried fabricated stats ("Capture 2–5x More Leads", "Most businesses
 * miss 40% of calls") plus a "ready within 48 hours" promise. The deck
 * is now 9 honest cards leading with the streaming video avatar; the
 * retired cards and claims must never come back.
 *
 * Job B — the wizard's custom-avatar step must set the real generation
 * expectation at the creation action: usually ready within a few hours,
 * allow up to 24 hours (our own Simli generation on Pro took ~3 hours
 * queue-to-ready on 2026-11-13). There is no email notification in the
 * flow, so the copy points the user back to the page — never invent one.
 */

const scanningAnimation = readFileSync(
  new URL("../components/landing/ScanningAnimation.tsx", import.meta.url),
  "utf8",
);
const avatarSettings = readFileSync(
  new URL("../components/AvatarSettings.tsx", import.meta.url),
  "utf8",
);

const DECK_KEYS = [
  "videoAvatar",
  "missCall",
  "yourListings",
  "warmTransfer",
  "appointments",
  "followUp",
  "wizardSetup",
  "pricing",
  "callSummary",
] as const;

const FABRICATED = /2–5x|2-5x|40%|48 hours/i;

describe("demo build-wait flashcard deck (scan.benefits)", () => {
  it("has exactly the 9 refreshed cards in every locale", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      expect(Object.keys(locale.scan.benefits), `${name}.scan.benefits`).toEqual([...DECK_KEYS]);
    }
  });

  it("the retired pre-avatar cards are gone from every locale", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      for (const retired of ["moreLeads", "liveFast", "chatAi"]) {
        expect(retired in locale.scan.benefits, `${name}.${retired}`).toBe(false);
      }
    }
  });

  it("carries no fabricated stats or the old 48-hour promise", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      const deckText = JSON.stringify(locale.scan.benefits);
      expect(deckText, `${name}.scan.benefits`).not.toMatch(FABRICATED);
    }
  });

  it("leads with the video avatar and states the mandated selling points (EN)", () => {
    const b = en.scan.benefits;
    expect(b.videoAvatar.headline).toContain("Face on Your Website");
    expect(b.videoAvatar.body).toContain("AI spokesperson");
    expect(b.yourListings.body).toContain("your own listings and services");
    expect(b.warmTransfer.headline).toContain("You Stay in Control");
    expect(b.followUp.body).toContain("permission");
    expect(b.wizardSetup.headline).toContain("15 Minutes");
    expect(b.pricing.headline).toContain("$99");
    expect(b.pricing.body).toContain("400 voice minutes");
    expect(b.pricing.body).toContain("optional add-on");
  });

  it("ScanningAnimation rotates the same 9 keys", () => {
    for (const key of DECK_KEYS) {
      expect(scanningAnimation, `ScanningAnimation key ${key}`).toContain(`key: "${key}"`);
    }
    for (const retired of ["moreLeads", "liveFast", "chatAi"]) {
      expect(scanningAnimation).not.toContain(`key: "${retired}"`);
    }
  });
});

describe("wizard custom-avatar wait expectation (AvatarSettings)", () => {
  it("states the hours expectation at the creation action", () => {
    expect(avatarSettings).toContain("usually ready within a few hours");
    expect(avatarSettings).toContain("please allow up to 24 hours");
    expect(avatarSettings).toContain("check back on this page");
  });

  it("no longer promises 'several minutes' for face generation", () => {
    expect(avatarSettings).not.toContain("several minutes up to about 24 hours");
    expect(avatarSettings).toContain("usually takes a few hours; please allow up to 24 hours");
  });

  it("does not invent an email notification for avatar readiness", () => {
    expect(avatarSettings).not.toMatch(/we('ll| will) email you/i);
    expect(avatarSettings).not.toMatch(/notified by email/i);
  });
});
