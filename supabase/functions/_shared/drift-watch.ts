// Drift watch (2026-11-16): a mechanical backstop for the two
// drifts Ron's D4-on-VPS test exposed — the model calling herself by
// ANOTHER persona's name ("Alex" inside an Aspen session) and a
// Portuguese session sliding into Spanish. Prompt locks already
// state both rules; per the standing pattern lesson, rules slip at
// transitions, so the proxy watches completed model turns and
// corrects ONCE per kind per session, at a turn boundary no other
// gate claimed (directives never stack).
//
// Conservative by design:
// - Identity fires only on SELF-identification patterns ("I'm X",
//   "sou o X", "me chamo X", "soy X"...) naming a DIFFERENT known
//   persona — merely MENTIONING a colleague ("let me introduce
//   Alex") never fires.
// - Language fires only on unambiguous Spanish orthography inside a
//   Portuguese session (¿, ¡, or a word containing ñ — Portuguese
//   uses nh, never ñ). Proper-name edge cases cost at most one
//   correction per session.

export const PERSONA_NAMES = ['Aspen', 'Sara', 'Alex', 'Frank', 'Monica', 'Denise', 'Daniel', 'Andy', 'James', 'Diego'] as const;

const SELF_ID_PATTERNS: Array<(name: string) => RegExp> = [
  (n) => new RegExp(`\\bI(?:'m| am) ${n}\\b`, 'i'),
  (n) => new RegExp(`\\bthis is ${n}\\b`, 'i'),
  (n) => new RegExp(`\\bmy name is ${n}\\b`, 'i'),
  (n) => new RegExp(`\\b(?:sou|eu sou) (?:o |a )?${n}\\b`, 'i'),
  (n) => new RegExp(`\\bme chamo ${n}\\b`, 'i'),
  (n) => new RegExp(`\\bmeu nome é ${n}\\b`, 'i'),
  (n) => new RegExp(`\\bsoy ${n}\\b`, 'i'),
  (n) => new RegExp(`\\bmi nombre es ${n}\\b`, 'i'),
];

export interface DriftWatchState {
  identityCorrected: boolean;
  languageCorrected: boolean;
}

export function newDriftWatch(): DriftWatchState {
  return { identityCorrected: false, languageCorrected: false };
}

/** The wrong persona name the model claimed for HERSELF, or null. */
export function identityDriftName(modelTurnText: string, ownName: string): string | null {
  const own = ownName.trim().toLowerCase();
  if (!modelTurnText) return null;
  for (const name of PERSONA_NAMES) {
    if (name.toLowerCase() === own) continue;
    for (const make of SELF_ID_PATTERNS) {
      if (make(name).test(modelTurnText)) return name;
    }
  }
  return null;
}

/** Unambiguous Spanish markers inside a Portuguese turn. */
export function spanishSlideInPortuguese(modelTurnText: string): boolean {
  if (!modelTurnText) return false;
  return /[¿¡]/.test(modelTurnText) || /\b\w*ñ\w*\b/i.test(modelTurnText);
}

export function identityCorrectionDirective(ownName: string, wrongName: string): string {
  return `[System note — identity correction: in your last turn you called yourself "${wrongName}". You are ${ownName}. That is your identity for this entire conversation, in every language, and it does not change when colleagues are mentioned or introduced. Continue as ${ownName} from your next sentence, without commenting on this correction or apologizing for it.]`;
}

export function portugueseCorrectionDirective(): string {
  return '[System note — language correction: Spanish slipped into your last turn. This conversation is in Brazilian Portuguese only. Continue in Portuguese from your next sentence, without commenting on this correction.]';
}
