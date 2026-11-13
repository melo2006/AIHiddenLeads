import { describe, expect, it } from "vitest";
import { GEMINI_LIVE_VOICES, VOICE_LANGUAGE_SETS, liveVoiceById } from "./voiceCatalog";

describe("Gemini Live voice catalog", () => {
  it("holds Google's full fixed set of 30 voices, each once", () => {
    expect(GEMINI_LIVE_VOICES).toHaveLength(30);
    expect(new Set(GEMINI_LIVE_VOICES.map((v) => v.id)).size).toBe(30);
  });

  it("labels carry style + gender only — never an accent claim", () => {
    for (const v of GEMINI_LIVE_VOICES) {
      expect(v.style.length).toBeGreaterThan(0);
      expect(["Female", "Male"]).toContain(v.gender);
      expect(`${v.id} ${v.style}`).not.toMatch(/accent|british|indian|american/i);
    }
  });

  it("language sets are 3 female + 3 male, all real catalog voices", () => {
    for (const set of VOICE_LANGUAGE_SETS) {
      expect(set.female).toHaveLength(3);
      expect(set.male).toHaveLength(3);
      for (const id of set.female) expect(liveVoiceById(id)?.gender).toBe("Female");
      for (const id of set.male) expect(liveVoiceById(id)?.gender).toBe("Male");
    }
    expect(VOICE_LANGUAGE_SETS.map((s) => s.language).sort()).toEqual(["es", "pt-BR"]);
  });
});
