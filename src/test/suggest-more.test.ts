// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NICHE_PACKS, packForIndustry, buildMoreItems, filterExcludedItems,
  type ChecklistItem,
} from "../../supabase/functions/_shared/niche-suggestions";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";
import fr from "../i18n/locales/fr.json";

// "Suggest more" (2026-11-18): the wizard asks for ANOTHER batch of
// suggestion cards. The hard guarantee: nothing already shown ever
// comes back — from the AI path, the curated pack path, or the
// generic/universal fallback — matched by id or by label
// (case/punctuation-insensitive).

const plumbing = packForIndustry("Plumbing").pack;
const genericServices = NICHE_PACKS.generic.services;
const universalGuardrails = NICHE_PACKS.generic.guardrails;
const ai = (id: string, label: string): ChecklistItem => ({ id, label, sentence: `We offer ${label.toLowerCase()}.` });

describe("buildMoreItems — exclusion across every source", () => {
  it("AI path: drops AI items excluded by id and by case-variant label", () => {
    const excludeIds = plumbing.services.map((i) => i.id);
    const excludeLabels = plumbing.services.map((i) => i.label);
    const aiItems = [
      ai("ai-9-sewer", "Sewer camera inspections"),
      ai("ai-9-drain", "DRAIN CLEANING & UNCLOGGING"), // case variant of a shown pack label
      ai("plumbing-repiping", "Something entirely new"), // reuses a shown id
    ];
    const out = buildMoreItems({ packItems: plumbing.services, genericItems: genericServices, aiItems, excludeIds, excludeLabels });
    expect(out.map((i) => i.label)).toContain("Sewer camera inspections");
    expect(out.some((i) => i.label.toLowerCase().includes("drain cleaning"))).toBe(false);
    expect(out.some((i) => i.id === "plumbing-repiping")).toBe(false);
    expect(out.some((i) => i.label === "Something entirely new")).toBe(false);
  });

  it("pack path: unexcluded pack leftovers lead the batch, in pack order", () => {
    const shown = plumbing.services.slice(0, 2);
    const out = buildMoreItems({
      packItems: plumbing.services, genericItems: genericServices, aiItems: [],
      excludeIds: shown.map((i) => i.id), excludeLabels: shown.map((i) => i.label),
    });
    expect(out.slice(0, 4).map((i) => i.id)).toEqual(plumbing.services.slice(2).map((i) => i.id));
    // Generic items fill only after the pack leftovers.
    expect(out[4].id).toBe(genericServices[0].id);
    expect(out.length).toBe(6); // capped
  });

  it("generic path: when pack and AI are exhausted, generic/universal items fill in", () => {
    const dental = packForIndustry("Dental").pack;
    const out = buildMoreItems({
      packItems: dental.guardrails, genericItems: universalGuardrails, aiItems: [],
      excludeIds: dental.guardrails.map((i) => i.id), excludeLabels: dental.guardrails.map((i) => i.label),
    });
    expect(out.map((i) => i.id)).toEqual(universalGuardrails.map((i) => i.id));
  });

  it("returns an empty batch when everything is excluded (honest end state)", () => {
    const all = [...plumbing.services, ...genericServices];
    const out = buildMoreItems({
      packItems: plumbing.services, genericItems: genericServices,
      aiItems: [ai("ai-1", "Consultations")], // duplicates a generic label, also excluded below
      excludeIds: all.map((i) => i.id), excludeLabels: all.map((i) => i.label),
    });
    expect(out).toEqual([]);
  });

  it("label matching ignores case and punctuation", () => {
    const out = buildMoreItems({
      packItems: plumbing.services, genericItems: [], aiItems: [],
      excludeIds: [], excludeLabels: ["drain cleaning unclogging", "  LEAK DETECTION & REPAIR "],
    });
    expect(out.some((i) => i.id === "plumbing-drain-cleaning")).toBe(false);
    expect(out.some((i) => i.id === "plumbing-leak-repair")).toBe(false);
    expect(out.length).toBe(4);
  });

  it("dedupes within the batch (an AI label that repeats a generic label appears once)", () => {
    const out = buildMoreItems({
      packItems: [], genericItems: genericServices,
      aiItems: [ai("ai-1", "Consultations")],
      excludeIds: [], excludeLabels: [],
    });
    expect(out.filter((i) => i.label === "Consultations").length).toBe(1);
    expect(out[0].id).toBe("ai-1"); // AI precedes the generic filler
  });

  it("caps the batch at 6 by default", () => {
    const many = Array.from({ length: 12 }, (_, i) => ai(`ai-${i}`, `Extra service ${i}`));
    const out = buildMoreItems({ packItems: [], genericItems: [], aiItems: many, excludeIds: [], excludeLabels: [] });
    expect(out.length).toBe(6);
  });
});

describe("filterExcludedItems — the final safety filter", () => {
  it("is a no-op copy when nothing is excluded", () => {
    const out = filterExcludedItems(plumbing.services, [], []);
    expect(out).toEqual(plumbing.services);
    expect(out).not.toBe(plumbing.services);
  });

  it("filters by id and by normalized label", () => {
    const out = filterExcludedItems(plumbing.services, ["plumbing-repiping"], ["water heater install repair"]);
    expect(out.some((i) => i.id === "plumbing-repiping")).toBe(false);
    expect(out.some((i) => i.id === "plumbing-water-heaters")).toBe(false);
    expect(out.length).toBe(4);
  });
});

describe("suggest-more wiring (source pins)", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(path.join(root, p), "utf8");
  const fn = read("supabase/functions/voice-agents/index.ts");
  const wizard = read("src/components/setup-wizard/SetupWizard.tsx");

  it("the function schema accepts excludeIds, excludeLabels and round", () => {
    expect(fn).toContain("excludeIds:z.array(z.string()");
    expect(fn).toContain("excludeLabels:z.array(z.string()");
    expect(fn).toContain("round:z.number().int()");
  });

  it("the handler instructs the model to differ and composes via the shared helpers", () => {
    expect(fn).toContain("ALREADY been shown");
    expect(fn).toContain("buildMoreItems(");
    expect(fn).toContain("filterExcludedItems(");
    expect(fn).toContain("NICHE_PACKS.generic");
  });

  it("the wizard sends exclusions, appends, and retires the button", () => {
    expect(wizard).toContain("async function suggestMore(");
    expect(wizard).toContain("excludeIds: items.map((i) => i.id)");
    expect(wizard).toContain("excludeLabels: items.map((i) => i.label)");
    expect(wizard).toContain("round: more.rounds + 1");
    expect(wizard).toContain("SuggestMoreRow");
    expect(wizard).toContain("MAX_MORE_ROUNDS = 3");
    expect(wizard).toContain("exhausted: true");
    expect(wizard).toContain("setServiceItems([...items, ...fresh])");
    expect(wizard).toContain("setGuardrailItems([...items, ...fresh])");
  });

  it("the wizard renders the localized strings", () => {
    for (const key of ["wizard.suggestMore", "wizard.suggestingMore", "wizard.suggestExhausted", "wizard.suggestOwnBelow"]) {
      expect(wizard).toContain(`t('${key}')`);
    }
  });
});

describe("suggest-more strings exist in all four locales", () => {
  const wizardOf = (o: unknown) => (o as { wizard?: Record<string, string> }).wizard || {};
  for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt], ["fr-CA", fr]] as const) {
    it(`${name} carries the four wizard keys`, () => {
      const w = wizardOf(locale);
      for (const key of ["suggestMore", "suggestingMore", "suggestExhausted", "suggestOwnBelow"]) {
        expect(typeof w[key], `${name}.wizard.${key}`).toBe("string");
        expect(w[key].length).toBeGreaterThan(0);
      }
    });
  }
  it("non-English locales actually translate the button", () => {
    expect(wizardOf(es).suggestMore).not.toBe(wizardOf(en).suggestMore);
    expect(wizardOf(pt).suggestMore).not.toBe(wizardOf(en).suggestMore);
    expect(wizardOf(fr).suggestMore).not.toBe(wizardOf(en).suggestMore);
  });
});
