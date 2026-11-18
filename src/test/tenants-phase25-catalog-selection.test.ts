import { describe, expect, it } from "vitest";
import {
  CATALOG_LANGUAGES,
  DEFAULT_CATALOG_SELECTION,
  isOffered,
  normalizeCatalogSelection,
  validateCatalogSelectionInput,
} from "@/lib/catalogSelection";
import { AVATAR_LIBRARY } from "@/lib/avatarLibrary";
import { GEMINI_LIVE_VOICES } from "@/lib/voiceCatalog";

// Phase 2.5 catalog selection (design 2026-11-18 §12.5): which
// avatars / voices / languages a reseller offers his clients.
// null = the whole library (new entries arrive automatically);
// French is deliberately NOT a catalog language in this phase.

describe("catalog selection — defaults", () => {
  it("defaults to the whole library and every supported language", () => {
    expect(DEFAULT_CATALOG_SELECTION.avatars).toBeNull();
    expect(DEFAULT_CATALOG_SELECTION.voices).toBeNull();
    expect(DEFAULT_CATALOG_SELECTION.languages).toEqual(["en", "es", "pt-BR"]);
    expect(normalizeCatalogSelection(null)).toEqual(DEFAULT_CATALOG_SELECTION);
    expect(normalizeCatalogSelection({})).toEqual(DEFAULT_CATALOG_SELECTION);
    expect(CATALOG_LANGUAGES).toEqual(["en", "es", "pt-BR"]);
    expect(CATALOG_LANGUAGES).not.toContain("fr-CA");
  });
  it("isOffered: null offers everything, a list offers only its members", () => {
    expect(isOffered(null, "anything")).toBe(true);
    expect(isOffered(["aspen"], "aspen")).toBe(true);
    expect(isOffered(["aspen"], "frank")).toBe(false);
    expect(isOffered([], "aspen")).toBe(false);
  });
});

describe("catalog selection — normalization", () => {
  it("dedupes key lists; unknown keys stay but are inert (they match nothing)", () => {
    // The shared module cannot import the client-side library, so an
    // unknown key is kept in the stored list where isOffered() simply
    // never matches it — it can never wrongly OFFER anything.
    const out = normalizeCatalogSelection({
      avatars: ["aspen", "aspen", "not-a-face"],
      voices: ["Kore", "NotAVoice"],
      languages: ["en", "fr-CA", "es"],
    });
    expect(out.avatars).toEqual(["aspen", "not-a-face"]);
    expect(out.voices).toEqual(["Kore", "NotAVoice"]);
    expect(isOffered(out.avatars, "not-a-face")).toBe(true); // stored…
    expect(AVATAR_LIBRARY.some((a) => a.key === "not-a-face")).toBe(false); // …but no such avatar exists to offer
    // Languages, a closed set, ARE filtered to the supported list.
    expect(out.languages).toEqual(["en", "es"]);
  });
  it("an emptied language list falls back to all languages (never none)", () => {
    expect(normalizeCatalogSelection({ languages: [] }).languages).toEqual(["en", "es", "pt-BR"]);
    expect(normalizeCatalogSelection({ languages: ["fr-CA"] }).languages).toEqual(["en", "es", "pt-BR"]);
  });
  it("every library key and voice id validates as offerable", () => {
    for (const a of AVATAR_LIBRARY) {
      expect(normalizeCatalogSelection({ avatars: [a.key] }).avatars).toEqual([a.key]);
    }
    for (const v of GEMINI_LIVE_VOICES) {
      expect(normalizeCatalogSelection({ voices: [v.id] }).voices).toEqual([v.id]);
    }
  });
});

describe("catalog selection — write validation", () => {
  it("rejects unsupported languages, an empty language list and junk shapes", () => {
    expect(validateCatalogSelectionInput({ languages: ["fr-CA"] })).toHaveProperty("error");
    expect(validateCatalogSelectionInput({ languages: [] })).toHaveProperty("error");
    expect(validateCatalogSelectionInput({ avatars: "aspen" })).toHaveProperty("error");
    expect(validateCatalogSelectionInput({ avatars: [42] })).toHaveProperty("error");
    expect(validateCatalogSelectionInput(null)).toHaveProperty("error");
  });
  it("accepts null lists (whole library) and partial selections", () => {
    const ok = validateCatalogSelectionInput({ avatars: null, voices: ["Kore"], languages: ["en"] });
    expect(ok).toEqual({ value: { avatars: null, voices: ["Kore"], languages: ["en"] } });
  });
});
