import { describe, expect, it } from "vitest";
import {
  AVATAR_LIBRARY,
  avatarLibraryEntryByFaceId,
  avatarLibraryPick,
  ASPEN_FACE_ID,
  FRANK_FACE_ID,
  LATINA_FACE_ID,
  BLACK_PROFESSIONAL_LADY_FACE_ID,
  EXECUTIVE_D_FACE_ID,
  MIDDLE_AGED_PRO_FACE_ID,
  SARA_FACE_ID,
  ALEX_FACE_ID,
} from "./avatarLibrary";
import { SIMLI_FACE_CATALOG } from "./simliFaceCatalog";
import { liveVoiceById } from "./voiceCatalog";

const OWN_IDS = [
  ASPEN_FACE_ID,
  FRANK_FACE_ID,
  LATINA_FACE_ID,
  BLACK_PROFESSIONAL_LADY_FACE_ID,
  EXECUTIVE_D_FACE_ID,
  MIDDLE_AGED_PRO_FACE_ID,
  SARA_FACE_ID,
  ALEX_FACE_ID,
];

describe("avatar library — data integrity", () => {
  it("orders Aspen, our customs, Sara and Alex first, in that order", () => {
    expect(AVATAR_LIBRARY.slice(0, 8).map((e) => e.faceId)).toEqual(OWN_IDS);
    expect(AVATAR_LIBRARY.slice(0, 8).every((e) => e.own)).toBe(true);
    expect(AVATAR_LIBRARY.slice(8).every((e) => !e.own)).toBe(true);
  });

  it("has unique face ids and unique keys", () => {
    expect(new Set(AVATAR_LIBRARY.map((e) => e.faceId)).size).toBe(AVATAR_LIBRARY.length);
    expect(new Set(AVATAR_LIBRARY.map((e) => e.key)).size).toBe(AVATAR_LIBRARY.length);
  });

  it("covers every Simli catalog face exactly once, plus Executive D", () => {
    for (const face of SIMLI_FACE_CATALOG) {
      expect(AVATAR_LIBRARY.filter((e) => e.faceId === face.id)).toHaveLength(1);
    }
    expect(AVATAR_LIBRARY).toHaveLength(SIMLI_FACE_CATALOG.length + 1);
  });

  it("carries settled names only for Aspen, Frank, Monica, Sara and Alex", () => {
    const settled = AVATAR_LIBRARY.filter((e) => e.nameSettled);
    expect(settled.map((e) => e.suggestedName).sort()).toEqual(["Alex", "Aspen", "Frank", "Monica", "Sara"]);
    for (const e of settled) expect(e.suggestedName).toBe(e.label);
  });

  it("labels Executive D descriptively — no settled name, no name pre-fill", () => {
    const exec = avatarLibraryEntryByFaceId(EXECUTIVE_D_FACE_ID);
    expect(exec?.label).toBe("Executive");
    expect(exec?.nameSettled).toBe(false);
    expect(exec?.suggestedName).toBeUndefined();
  });

  it("labels Monica with her settled name — picking her tile pre-fills it", () => {
    const monica = avatarLibraryEntryByFaceId(LATINA_FACE_ID);
    expect(monica?.label).toBe("Monica");
    expect(monica?.nameSettled).toBe(true);
    expect(monica?.suggestedName).toBe("Monica");
  });

  it("labels Black Professional Lady and Middle-Aged Pro descriptively — working labels, no name pre-fill", () => {
    const lady = avatarLibraryEntryByFaceId(BLACK_PROFESSIONAL_LADY_FACE_ID);
    expect(lady?.label).toBe("Black Professional Lady");
    expect(lady?.nameSettled).toBe(false);
    expect(lady?.suggestedName).toBeUndefined();
    const pro = avatarLibraryEntryByFaceId(MIDDLE_AGED_PRO_FACE_ID);
    expect(pro?.label).toBe("Middle-Aged Pro");
    expect(pro?.nameSettled).toBe(false);
    expect(pro?.suggestedName).toBeUndefined();
  });

  it("pairs our models with real Gemini Live voices", () => {
    expect(avatarLibraryEntryByFaceId(ASPEN_FACE_ID)?.matchedVoice).toBe("Kore");
    expect(avatarLibraryEntryByFaceId(FRANK_FACE_ID)?.matchedVoice).toBe("Charon");
    expect(avatarLibraryEntryByFaceId(LATINA_FACE_ID)?.matchedVoice).toBe("Sulafat");
    expect(avatarLibraryEntryByFaceId(BLACK_PROFESSIONAL_LADY_FACE_ID)?.matchedVoice).toBe("Despina");
    expect(avatarLibraryEntryByFaceId(MIDDLE_AGED_PRO_FACE_ID)?.matchedVoice).toBe("Rasalgethi");
    expect(avatarLibraryEntryByFaceId(SARA_FACE_ID)?.matchedVoice).toBe("Leda");
    expect(avatarLibraryEntryByFaceId(ALEX_FACE_ID)?.matchedVoice).toBe("Puck");
    for (const e of AVATAR_LIBRARY) {
      if (e.matchedVoice) expect(liveVoiceById(e.matchedVoice), `${e.label} → ${e.matchedVoice}`).toBeDefined();
    }
  });

  it("gives every one of our models a tile image", () => {
    for (const e of AVATAR_LIBRARY.filter((x) => x.own)) expect(e.image, e.label).toBeTruthy();
  });

  it("presets carry no suggested name and no matched voice", () => {
    for (const e of AVATAR_LIBRARY.filter((x) => !x.own)) {
      expect(e.suggestedName).toBeUndefined();
      expect(e.matchedVoice).toBeUndefined();
    }
  });

  it("does not include faces whose Simli generation has not completed", () => {
    // Monica's face, the Black Professional Lady and Middle-Aged Pro
    // landed once their face ids existed (they are catalog faces,
    // listed as own models above). Latino Techie stays absent until
    // its face id exists; nothing beyond the catalog + Executive D
    // may sneak in.
    const known = new Set([...SIMLI_FACE_CATALOG.map((f) => f.id), EXECUTIVE_D_FACE_ID]);
    for (const e of AVATAR_LIBRARY) expect(known.has(e.faceId)).toBe(true);
  });
});

describe("avatar library — pick behavior (pure)", () => {
  it("picking Frank applies his face, the Charon voice and the Frank name", () => {
    const frank = avatarLibraryEntryByFaceId(FRANK_FACE_ID)!;
    expect(avatarLibraryPick(frank)).toEqual({ faceId: FRANK_FACE_ID, voice: "Charon", suggestedName: "Frank" });
  });

  it("picking Executive applies face + matched voice but NO name", () => {
    const exec = avatarLibraryEntryByFaceId(EXECUTIVE_D_FACE_ID)!;
    const pick = avatarLibraryPick(exec);
    expect(pick.faceId).toBe(EXECUTIVE_D_FACE_ID);
    expect(pick.voice).toBe(exec.matchedVoice);
    expect("suggestedName" in pick).toBe(false);
  });

  it("picking Monica applies her face, the Sulafat voice AND her settled name", () => {
    const monica = avatarLibraryEntryByFaceId(LATINA_FACE_ID)!;
    expect(avatarLibraryPick(monica)).toEqual({ faceId: LATINA_FACE_ID, voice: "Sulafat", suggestedName: "Monica" });
  });

  it("picking Black Professional Lady or Middle-Aged Pro applies face + matched voice but NO name", () => {
    const lady = avatarLibraryEntryByFaceId(BLACK_PROFESSIONAL_LADY_FACE_ID)!;
    expect(avatarLibraryPick(lady)).toEqual({ faceId: BLACK_PROFESSIONAL_LADY_FACE_ID, voice: "Despina" });
    const pro = avatarLibraryEntryByFaceId(MIDDLE_AGED_PRO_FACE_ID)!;
    expect(avatarLibraryPick(pro)).toEqual({ faceId: MIDDLE_AGED_PRO_FACE_ID, voice: "Rasalgethi" });
  });

  it("picking a preset applies only the face — voice and name untouched", () => {
    const preset = AVATAR_LIBRARY.find((e) => !e.own)!;
    expect(avatarLibraryPick(preset)).toEqual({ faceId: preset.faceId });
  });

  it("picking never mutates the library", () => {
    const before = JSON.stringify(AVATAR_LIBRARY);
    for (const e of AVATAR_LIBRARY) avatarLibraryPick(e);
    expect(JSON.stringify(AVATAR_LIBRARY)).toBe(before);
  });
});
