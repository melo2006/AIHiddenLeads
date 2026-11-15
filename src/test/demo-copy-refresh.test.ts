// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";

/**
 * Copy-refresh guards (Ron's direction, 2026-11-13; deck rewritten
 * 2026-11-14; rebuilt as a feature grid by Publish #73, 2026-11-15).
 *
 * Job A — the demo build-wait deck (scan.benefits, shown by
 * ScanningAnimation while a demo builds) predated the video avatar and
 * carried fabricated stats ("Capture 2–5x More Leads", "Most businesses
 * miss 40% of calls") plus a "ready within 48 hours" promise. The
 * 2026-11-14 pass made it an honest 6-card rotating set. Publish #73
 * (owner's directive: "the scan wait is a captive audience — make it
 * SELL") replaced the one-at-a-time rotation with a six-card feature
 * GRID — all six visible at once, bigger icons — in selling order:
 * (1) live VIDEO spokesperson with the avatar-library row, (2) natural
 * two-way conversation, (3) one dashboard for every call, (4) booking
 * + automatic confirmations, (5) warm transfer with an AI briefing,
 * (6) ready in under two minutes. The retired cards and claims must
 * never come back.
 *
 * Publish #77 (same day) changed the PRESENTATION again, on the
 * owner's phone test of #73: he rejected the grid (too many cards,
 * too much text, past one screen) and ordered the cards back into a
 * rotation — "one big card one page at any given time… like a hero
 * page." So the deck is once more one-at-a-time, now as a big
 * rotating hero with dots + arrows. The six cards, their order and
 * their copy are the #73 set (two longest bodies lightly trimmed so
 * a big card stays readable, pinned phrases kept); only the old
 * deck's state names (benefitMessages / currentBenefit) stay retired.
 *
 * Presenter-neutral rule, one deliberate exception: card copy names no
 * presenter — the deck also shows during Frank / Monica / Denise
 * demos — EXCEPT the video card's avatar row, which names the avatar
 * LIBRARY (Aspen / Frank / Sara + more) because choosing your face is
 * the feature being sold there. Names may appear ONLY in
 * videoAvatar.avatarsNote, never in a headline or body.
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
  "conversation",
  "dashboard",
  "appointments",
  "warmTransfer",
  "readyFast",
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
  // Retired by Publish #73: the 2026-11-14 rotating deck's middle
  // cards were absorbed into the new six (missed calls → conversation
  // + dashboard; lead capture → dashboard; prospects left the deck —
  // the offer is stated once, in the demo page's price strip).
  "missCall",
  "leadCapture",
  "prospects",
] as const;

const FABRICATED = /2–5x|2-5x|40%|48 hours/i;

/** No presenter may be named — the deck runs during every presenter's demo.
 *  (Monica is her settled name since 2026-11-14; her retired working
 *  label "Latina" stays in the guard so it can never slip back in.) */
const PRESENTER_NAMES = /\b(Aspen|Frank|Latina|Monica|Sara|Alex)\b/;

describe("demo build-wait feature deck (scan.benefits)", () => {
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

  it("names a presenter ONLY in the video card's avatar-library row", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      const b = locale.scan.benefits as unknown as Record<string, { headline: string; body: string; avatarsNote?: string }>;
      // Headlines + bodies stay presenter-neutral in every locale…
      const copyText = DECK_KEYS.map((k) => `${b[k].headline} ${b[k].body}`).join(" ");
      expect(copyText, `${name}.scan.benefits copy`).not.toMatch(PRESENTER_NAMES);
      // …and the one allowed naming spot is the avatar row, which must
      // name the library (Aspen / Frank / Sara) in every locale.
      expect(b.videoAvatar.avatarsNote, `${name}.avatarsNote`).toContain("Aspen");
      expect(b.videoAvatar.avatarsNote, `${name}.avatarsNote`).toContain("Frank");
      expect(b.videoAvatar.avatarsNote, `${name}.avatarsNote`).toContain("Sara");
    }
  });

  it("leads with the video avatar and states the mandated selling points (EN)", () => {
    const b = en.scan.benefits;
    // (1) live VIDEO spokesperson, face-to-face, two-way, on the visitor's own site
    expect(b.videoAvatar.headline).toContain("Face on Your Website");
    expect(b.videoAvatar.body).toContain("AI spokesperson");
    expect(b.videoAvatar.body).toContain("live streaming video avatar");
    expect(b.videoAvatar.body).toContain("face-to-face");
    expect(b.videoAvatar.body).toContain("two-way video conversation");
    expect(b.videoAvatar.avatarsNote).toContain("more to choose from");
    // (2) a real two-way conversation — listens, answers, asks back
    expect(b.conversation.body).toContain("listens");
    expect(b.conversation.body).toContain("answers questions");
    expect(b.conversation.body).toContain("asks the right ones back");
    // (3) one dashboard — calls, transcripts, texts, appointments.
    // (Never "recordings": the approved realtor FAQ says recordings
    // are not yet available, so the card must not promise them.)
    expect(b.dashboard.body).toContain("transcript");
    expect(b.dashboard.body).not.toMatch(/recording/i);
    // (4) books preference-first AND confirms automatically
    expect(b.appointments.body).toContain("preference");
    expect(b.appointments.body).toContain("preferred time first");
    expect(b.appointments.body).toContain("confirmation");
    // (5) warm transfer with an AI summary briefing, visitor in control
    expect(b.warmTransfer.body).toContain("summary of the conversation");
    expect(b.warmTransfer.body).toContain("stay in control");
    // (6) the under-two-minutes proof, scoped to the demo itself
    expect(b.readyFast.headline).toContain("Under Two Minutes");
    expect(b.readyFast.body).toContain("under two minutes");
  });

  it("ScanningAnimation shows the same 6 keys in the same order, as a rotating hero", () => {
    const block = scanningAnimation.slice(
      scanningAnimation.indexOf("const featureCards"),
      scanningAnimation.indexOf("] as const;", scanningAnimation.indexOf("const featureCards")),
    );
    const shown = [...block.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    expect(shown).toEqual([...DECK_KEYS]);
    for (const retired of RETIRED_KEYS) {
      expect(scanningAnimation).not.toContain(`key: "${retired}"`);
    }
    // Publish #77: the presentation is a one-card-at-a-time rotating
    // hero (owner's correction of the #73 grid) — but the OLD deck's
    // implementation names stay retired; the rotator is new code, not
    // a resurrection of the pre-#73 benefit carousel.
    expect(scanningAnimation).not.toContain("benefitMessages");
    expect(scanningAnimation).not.toContain("currentBenefit");
    expect(scanningAnimation).toContain("FEATURE_ROTATE_DURATION");
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
