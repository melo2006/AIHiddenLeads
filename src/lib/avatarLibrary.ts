/**
 * The avatar library — the faces a customer (or an admin setting up on a
 * client's behalf) can pick from in the setup wizard's face step.
 *
 * Order is product order, not catalog order: Aspen first, then OUR created
 * custom faces, then Sara and Alex (our other named personas), then the
 * remaining Simli standard presets from SIMLI_FACE_CATALOG.
 *
 * Adding a face later is a one-line entry in OWN_MODELS (customs) — the
 * preset tail is derived from SIMLI_FACE_CATALOG automatically, and a face
 * already listed above is never repeated in the tail.
 *
 * `suggestedName` is the name that pre-fills the assistant-name field when
 * the tile is picked. It is only set where the name is a real name of the
 * face: our settled product names (Aspen, Frank, Sara, Alex). Descriptive
 * tiles (e.g. "Executive") and Simli presets carry NO suggested name —
 * picking them never renames the assistant and never invents a name.
 * Editing the assistant name afterwards renames THEIR assistant only; the
 * library entry itself is never mutated.
 *
 * `matchedVoice` is the Gemini Live voice paired with our own models. It is
 * applied when the tile is picked; the customer can change it right after
 * in the full voice picker. Presets carry no matched voice — picking one
 * leaves the current voice untouched.
 */
import { SIMLI_FACE_CATALOG, type AvatarFace } from "@/lib/simliFaceCatalog";
import frankTile from "@/assets/avatar-library/frank-senior-owner.png";
import executiveTile from "@/assets/avatar-library/executive-d.png";

export interface AvatarLibraryEntry {
  /** Stable library key (not a Simli id). */
  key: string;
  /** Simli face id selected when this tile is picked. */
  faceId: string;
  /** Tile label shown under the portrait. */
  label: string;
  /** Name pre-filled into the assistant-name field on pick, when the face has one. */
  suggestedName?: string;
  /** True only for our settled product names (Aspen, Frank, Sara, Alex). */
  nameSettled: boolean;
  /** Gemini Live voice applied on pick (our own models only). */
  matchedVoice?: string;
  image?: string;
  category?: string;
  /** Mirrors the catalog flag: the face is one of OUR generated faces whose
   *  readiness must be checked before a live preview. */
  generation?: boolean;
  /** True for Aspen, our created customs, Sara and Alex; false for Simli presets. */
  own: boolean;
}

const catalogById = new Map(SIMLI_FACE_CATALOG.map((f) => [f.id, f]));
const catalogImage = (faceId: string): string | undefined => catalogById.get(faceId)?.image;
const catalogGeneration = (faceId: string): boolean | undefined => catalogById.get(faceId)?.generation;

export const ASPEN_FACE_ID = "ed8fedd9-6c86-4dc5-bb3a-017c06146efc";
export const FRANK_FACE_ID = "b3f85f7f-57ea-4f24-b1f6-a57229b4fae1";
export const EXECUTIVE_D_FACE_ID = "9262002f-2b65-4335-8ebf-6092a5cfe01e";
export const SARA_FACE_ID = "f735e62c-dce7-4c0b-8e85-1c7e21774c45";
export const ALEX_FACE_ID = "a36d66df-a23d-4569-996b-d0e990019857";

/**
 * Our own models, in library order. To add a newly created custom face,
 * add ONE entry here (plus its row in this list's order position).
 *
 * ⚠️ EXECUTIVE voice choice (flagged for Ron's ear-check, 2026-11-13):
 * Executive D's matched voice is "Sadaltager" (Knowledgeable · Male) — a
 * mature, authoritative read for an early-40s executive. It is a proposal,
 * not settled; same status as his unapproved product name.
 */
const OWN_MODELS: AvatarLibraryEntry[] = [
  {
    key: "aspen",
    faceId: ASPEN_FACE_ID,
    label: "Aspen",
    suggestedName: "Aspen",
    nameSettled: true,
    matchedVoice: "Kore",
    image: catalogImage(ASPEN_FACE_ID),
    category: "Your face",
    generation: catalogGeneration(ASPEN_FACE_ID),
    own: true,
  },
  {
    key: "frank",
    faceId: FRANK_FACE_ID,
    label: "Frank",
    suggestedName: "Frank",
    nameSettled: true,
    matchedVoice: "Charon",
    // Tile uses the approved Senior Owner portrait (finals PNG), not the
    // Simli-generated still in the preset catalog.
    image: frankTile,
    category: "Your face",
    generation: catalogGeneration(FRANK_FACE_ID),
    own: true,
  },
  {
    key: "executive",
    faceId: EXECUTIVE_D_FACE_ID,
    // Descriptive label only: this face's product name is an UNAPPROVED
    // proposal, so the tile must not present a settled name and picking it
    // pre-fills no name.
    label: "Executive",
    nameSettled: false,
    matchedVoice: "Sadaltager",
    image: executiveTile,
    category: "Your face",
    generation: true,
    own: true,
  },
  {
    key: "sara",
    faceId: SARA_FACE_ID,
    label: "Sara",
    suggestedName: "Sara",
    nameSettled: true,
    matchedVoice: "Leda",
    image: catalogImage(SARA_FACE_ID),
    category: "Your face",
    own: true,
  },
  {
    key: "alex",
    faceId: ALEX_FACE_ID,
    // The Simli preset is named "Lukas"; our persona on this face is Alex.
    label: "Alex",
    suggestedName: "Alex",
    nameSettled: true,
    matchedVoice: "Puck",
    image: catalogImage(ALEX_FACE_ID),
    category: "Your face",
    own: true,
  },
];

const ownFaceIds = new Set(OWN_MODELS.map((e) => e.faceId));

const displayName = (face: AvatarFace): string => face.name.split(" · ")[0];

const PRESETS: AvatarLibraryEntry[] = SIMLI_FACE_CATALOG.filter((f) => !ownFaceIds.has(f.id)).map(
  (f) => ({
    key: `preset-${f.id}`,
    faceId: f.id,
    label: displayName(f),
    nameSettled: false,
    image: f.image,
    category: f.category,
    generation: f.generation,
    own: false,
  }),
);

export const AVATAR_LIBRARY: AvatarLibraryEntry[] = [...OWN_MODELS, ...PRESETS];

export const avatarLibraryEntryByFaceId = (faceId: string): AvatarLibraryEntry | undefined =>
  AVATAR_LIBRARY.find((e) => e.faceId === faceId);

/** What picking a library tile applies, beyond the face itself. Pure, so the
 *  wizard and the admin setup share exactly the same pick behavior. */
export interface AvatarLibraryPick {
  faceId: string;
  /** Voice to apply, when the tile carries a matched voice. */
  voice?: string;
  /** Name to pre-fill, when the tile carries a suggested name. */
  suggestedName?: string;
}

export const avatarLibraryPick = (entry: AvatarLibraryEntry): AvatarLibraryPick => ({
  faceId: entry.faceId,
  ...(entry.matchedVoice ? { voice: entry.matchedVoice } : {}),
  ...(entry.suggestedName ? { suggestedName: entry.suggestedName } : {}),
});
