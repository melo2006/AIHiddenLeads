// Per-language persona voices for demo sessions (Publish #66, 2026-11-15).
//
// Gemini Live voices are language-agnostic — the same voice speaks any
// session language (see the note in src/lib/voiceCatalog.ts) — but the
// product carries CURATED per-language voice sets (the 30-voice picker's
// VOICE_LANGUAGE_SETS, mirrored here for the edge bundle): when a demo
// session runs in Spanish or Brazilian Portuguese, the persona speaks with
// the voice the product pairs with that language, not the English-context
// default. Brazilian Portuguese ONLY: the pt-BR set is Brazilian in
// wording and voice pairing; there is no European Portuguese set.
//
// Resolution order inside voiceForLocaleSession:
//   1. the session's current voice, unchanged, when it already belongs to
//      the locale's set — this also protects an admin Demo Voices
//      override: a voice Ron deliberately picked that already belongs to
//      the session's language is never stomped by the remap;
//   2. the explicit per-persona map below (style-proximity picks, noted
//      per persona);
//   3. the first voice of the same gender in the locale's set (gender
//      table mirrors src/lib/voiceCatalog.ts);
//   4. otherwise the current voice, unchanged (never an invalid voice).
// English sessions never remap: locale 'en'/null returns the voice as-is.
//
// French (fr-CA) sessions deliberately have NO curated voice set and NO
// remap (French package, 2026-11-18): Gemini Live voices are multilingual
// and speak French with the persona's own voice; no French voice pairing
// has been curated or ear-tested, so inventing one would be a guess.
// voiceForLocaleSession returns the current voice unchanged for fr-CA,
// exactly like any other unlisted locale. If a curated French set is
// ever chosen, add it here AND to VOICE_LANGUAGE_SETS together.

import { VOICES } from './voice-config.ts';

export type VoiceGender = 'female' | 'male';

/** Mirror of VOICE_LANGUAGE_SETS in src/lib/voiceCatalog.ts (pt-BR + es). */
export const LOCALE_VOICE_SETS: Record<'es' | 'pt-BR', Record<VoiceGender, string[]>> = {
  es: {
    female: ['Kore', 'Aoede', 'Sulafat'],
    male: ['Puck', 'Charon', 'Orus'],
  },
  'pt-BR': {
    female: ['Zephyr', 'Despina', 'Callirrhoe'],
    male: ['Fenrir', 'Alnilam', 'Iapetus'],
  },
};

/** Mirror of the gender column in src/lib/voiceCatalog.ts VOICE_CATALOG. */
export const VOICE_GENDERS: Record<string, VoiceGender> = {
  Zephyr: 'female', Puck: 'male', Charon: 'male', Kore: 'female',
  Fenrir: 'male', Leda: 'female', Orus: 'male', Aoede: 'female',
  Callirrhoe: 'female', Autonoe: 'female', Enceladus: 'male',
  Iapetus: 'male', Umbriel: 'male', Algieba: 'female', Despina: 'female',
  Erinome: 'female', Algenib: 'male', Rasalgethi: 'male',
  Laomedeia: 'female', Achernar: 'male', Alnilam: 'male', Schedar: 'male',
  Gacrux: 'female', Pulcherrima: 'female', Achird: 'male',
  Zubenelgenubi: 'male', Vindemiatrix: 'female', Sadachbia: 'female',
  Sadaltager: 'male', Sulafat: 'female',
};

/**
 * Explicit per-persona picks (closest style match inside each set):
 *  - aspen  (Kore, firm female host)      pt-BR Despina (smooth, the set's
 *    professional female) · es Kore (already in the es set).
 *  - sara   (Leda, youthful female)       pt-BR Zephyr (bright) ·
 *    es Aoede (breezy).
 *  - alex   (Puck, upbeat male)           pt-BR Fenrir (excitable) ·
 *    es Puck (already in the es set).
 *  - frank  (Schedar, even senior male)   pt-BR Alnilam (firm) ·
 *    es Orus (firm).
 *  - latina / Monica (Sulafat, warm female) pt-BR Callirrhoe (easy-going)
 *    · es Sulafat (already in the es set).
 *  - black-professional-lady (Despina)    pt-BR Despina (already in the
 *    pt-BR set) · es Kore (firm).
 */
export const PERSONA_LOCALE_VOICES: Record<string, Partial<Record<'es' | 'pt-BR', string>>> = {
  aspen: { 'pt-BR': 'Despina', es: 'Kore' },
  sara: { 'pt-BR': 'Zephyr', es: 'Aoede' },
  alex: { 'pt-BR': 'Fenrir', es: 'Puck' },
  frank: { 'pt-BR': 'Alnilam', es: 'Orus' },
  latina: { 'pt-BR': 'Callirrhoe', es: 'Sulafat' },
  'black-professional-lady': { 'pt-BR': 'Despina', es: 'Kore' },
  // James + Diego (2026-11-16, Muse's proposals alongside their
  // base voices): both ride the proven male remap pair — Alnilam
  // for pt-BR (Diego's base voice too), Orus for es (the es male
  // set carries no Alnilam).
  james: { 'pt-BR': 'Alnilam', es: 'Orus' },
  diego: { 'pt-BR': 'Alnilam', es: 'Orus' },
};

/** The voice a session in `locale` should use, given the persona's
 *  currently resolved voice. See the resolution order in the header. */
export function voiceForLocaleSession(
  currentVoice: string,
  personaId: string | null | undefined,
  locale: string | null | undefined,
): string {
  if (locale !== 'es' && locale !== 'pt-BR') return currentVoice;
  const set = LOCALE_VOICE_SETS[locale];
  if (set.female.includes(currentVoice) || set.male.includes(currentVoice)) return currentVoice;
  const mapped = personaId ? PERSONA_LOCALE_VOICES[personaId]?.[locale] : undefined;
  if (mapped && (VOICES as readonly string[]).includes(mapped)) return mapped;
  const gender = VOICE_GENDERS[currentVoice];
  if (gender) return set[gender][0];
  return currentVoice;
}
