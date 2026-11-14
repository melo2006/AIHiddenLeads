// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";

/**
 * Copy-refresh guards (Ron's direction, 2026-11-13; deck rewritten
 * 2026-11-14).
 *
 * Job A — the demo build-wait flashcard deck (scan.benefits, rotated by
 * ScanningAnimation while a demo builds) predated the video avatar and
 * carried fabricated stats ("Capture 2–5x More Leads", "Most businesses
 * miss 40% of calls") plus a "ready within 48 hours" promise. The
 * 2026-11-14 homepage compliance pass made it 10 honest cards, but it
 * still named Aspen in four cards and rotated warm transfer mid-deck —
 * Ron caught exactly that card on his phone during a non-Aspen demo.
 * The deck is now the agreed 6-card presenter-neutral set, in selling
 * order: (1) live VIDEO spokesperson, (2) answers every call 24/7
 * instantly, (3) captures name / need / callback number, (4) books
 * appointments preference-first, (5) warm transfer with a summary,
 * (6) up to 50 fresh B2B prospects with the honesty qualifier. No card
 * may name any presenter — the deck also shows during Frank, Monica
 * and Black Professional Lady demos. The retired cards and claims must
 * never come back.
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
  "leadCapture",
  "appointments",
  "warmTransfer",
  "prospects",
] as const;

const RETIRED_KEYS = [
  "moreLeads",
  "liveFast",
  "chatAi",
  "yourListings",
  "followUp",
  "wizardSetup",
  "pricing",
  "callSummary",
] as const;

const FABRICATED = /2–5x|2-5x|40%|48 hours/i;

/** No presenter may be named — the deck runs during every presenter's demo.
 *  (Monica is her settled name since 2026-11-14; her retired working
 *  label "Latina" stays in the guard so it can never slip back in.) */
const PRESENTER_NAMES = /\b(Aspen|Frank|Latina|Monica|Sara|Alex)\b/;

describe("demo build-wait flashcard deck (scan.benefits)", () => {
  it("has exactly the 6 agreed cards, in selling order, in every locale", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      expect(Object.keys(locale.scan.benefits), `${name}.scan.benefits`).toEqual([...DECK_KEYS]);
    }
  });

  it("the retired cards are gone from every locale", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      for (const retired of RETIRED_KEYS) {
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

  it("names no presenter in any locale", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      const deckText = JSON.stringify(locale.scan.benefits);
      expect(deckText, `${name}.scan.benefits`).not.toMatch(PRESENTER_NAMES);
    }
  });

  it("leads with the video avatar and states the mandated selling points (EN)", () => {
    const b = en.scan.benefits;
    // (1) live VIDEO spokesperson, face-to-face, on the visitor's own site
    expect(b.videoAvatar.headline).toContain("Face on Your Website");
    expect(b.videoAvatar.body).toContain("AI spokesperson");
    expect(b.videoAvatar.body).toContain("live streaming video avatar");
    expect(b.videoAvatar.body).toContain("face-to-face");
    // (2) answers every call 24/7 instantly — never miss a lead
    expect(b.missCall.body).toContain("answers every call instantly");
    expect(b.missCall.body).toContain("24/7");
    expect(b.missCall.body).toContain("never miss another lead");
    // (3) captures name, need and callback number
    expect(b.leadCapture.body).toContain("name");
    expect(b.leadCapture.body).toContain("callback number");
    // (4) books appointments preference-first
    expect(b.appointments.body).toContain("preference");
    expect(b.appointments.body).toContain("preferred time first");
    // (5) warm transfer with a summary, visitor stays in control
    expect(b.warmTransfer.headline).toContain("You Stay in Control");
    expect(b.warmTransfer.body).toContain("summary of the conversation");
    // (6) prospects with the full honesty qualifier
    expect(b.prospects.body).toContain("up to 50 fresh B2B prospects");
    expect(b.prospects.body).toContain("counts vary by market");
    expect(b.prospects.body).toContain("no specific count is guaranteed");
  });

  it("ScanningAnimation rotates the same 6 keys in the same order", () => {
    const block = scanningAnimation.slice(
      scanningAnimation.indexOf("const benefitMessages"),
      scanningAnimation.indexOf("];", scanningAnimation.indexOf("const benefitMessages")),
    );
    const rotated = [...block.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    expect(rotated).toEqual([...DECK_KEYS]);
    for (const retired of RETIRED_KEYS) {
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
