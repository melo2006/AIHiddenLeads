import { PERSONAS } from './personas.ts';
import type { PersonaId } from './personas.ts';

// Visitor farewell detection for the Gemini Live proxy (Batch 1,
// 2026-11-12). D3 evidence: the visitor said goodbye five times,
// Aspen signed off five times, and the session never ended — the
// model has no way to hang up, so the proxy watches the visitor's
// COMPLETED utterances itself and, on a clear farewell, ends the
// session after the model's own closing line (see the turnComplete
// wiring in gemini-live-proxy).
//
// SINGLE-SOURCE FAREWELL (presenter farewell fix, 2026-11-14): the
// farewell detection is evaluated on the model's turnComplete —
// i.e. AFTER the model has already answered the visitor's goodbye
// with its own closing line (the GOODBYES rule in voice-config.ts
// scripts exactly one). The proxy therefore injects NO closing
// instruction of its own: an earlier version did, and the model
// dutifully closed TWICE — once for the goodbye, once for the
// injection (Ron's Frank/Martinez phone test, 2026-11-14: "he said
// goodbye and then he said goodbye again"). The proxy's only jobs
// on a farewell are the hang-up timer and the session-ended banner
// below; the spoken farewell belongs to the active speaker alone.
//
// CONSERVATIVE by design: a false positive hangs up on a visitor who
// wanted to keep talking, which is far worse than a missed goodbye
// (Aspen's ordinary closing + the pacing/session ceilings still end
// those calls). Matching is therefore WHOLE-UTTERANCE and anchored:
// after normalization the entire utterance must be a farewell — a
// farewell word buried in a longer sentence, a question ABOUT
// goodbyes, a quoted goodbye, or a farewell followed by a new
// request never counts.

/** Grace between Aspen's closing line and the proxy ending the
 *  session — mirrors the proxy's quiet-period close pattern. The
 *  visitor can still cancel it by speaking again (see proxy). */
export const FAREWELL_END_DELAY_MS = 9000;

/** The whole-demo presenter personas (personas.ts isPresenterPersona):
 *  a session stamped with one of these ids in config.demoPresenter is
 *  FRONTED by that presenter, whatever its name field says. */
const PRESENTER_PERSONA_IDS: ReadonlySet<string> = new Set([
  'frank',
  'latina',
  'black-professional-lady',
]);

/**
 * The name the session-ended banner thanks: the session's OWN
 * speaker. A presenter stamp (config.demoPresenter, set by
 * gemini-session on solo-presenter demos) outranks the config's name
 * field, so a presenter demo can never be thanked as "Aspen" by a
 * stale or missing name — the presenter-owns-close batch stamped the
 * name correctly on the parent, and this precedence makes the
 * banner depend on the one stamp that defines the demo's front
 * person. Persona segments carry their persona's display name in
 * config.name (gemini-session segment branch) and no presenter
 * stamp, so the speaker who was live at the goodbye is thanked.
 * Platform sessions carry 'Aspen' and stay byte-identical.
 */
export function farewellSpeakerName(
  config: { name?: unknown; demoPresenter?: unknown } | null | undefined,
): string {
  const presenter = typeof config?.demoPresenter === 'string' ? config.demoPresenter : '';
  if (PRESENTER_PERSONA_IDS.has(presenter)) {
    return PERSONAS[presenter as PersonaId].displayName;
  }
  const name = typeof config?.name === 'string' ? config.name.trim() : '';
  return name || 'Aspen';
}

/** Longest utterance that can be a standalone farewell. */
export const FAREWELL_MAX_WORDS = 12;

const SOFT_PREFIXES = [
  'thank you', 'thanks', 'okay', 'ok', 'alright', 'well', 'great',
  'perfect', 'please', 'gracias', 'obrigada', 'obrigado',
];

const TRAILING_SOFT = ['thank you', 'thanks', 'now', 'please'];

// Whole-utterance cores left once soft prefixes / trailing softeners
// are stripped. Anything with content beyond these is not a farewell.
const CORES = new Set([
  'bye', 'bye bye', 'goodbye', 'good bye',
  'see you', 'see you later', 'see you soon',
  'gotta go', 'i gotta go', 'i have to go', 'i need to go',
  'i must go', 'have to go', 'need to go', 'i have got to go',
  'thats all', 'that is all', 'thatll be all', 'that will be all',
  'thats it', 'that is it',
  'im done', 'i am done',
  'disconnect', 'disconnect me', 'hang up', 'end the call', 'end call',
  // Standalone Spanish / Portuguese farewells (diacritics are stripped
  // during normalization, so adiós arrives here as 'adios').
  'adios', 'adeus', 'tchau', 'hasta luego',
]);

// A farewell immediately followed by a second farewell ("gotta go,
// bye") is still just a farewell.
const COMBO = /^(gotta go|i gotta go|i have to go|i need to go|see you|see you later|see you soon) (bye|goodbye)$/;

// Guards applied to the normalized text before any matching: negation,
// questions and reported speech are never the visitor's own goodbye.
const GUARDS: RegExp[] = [
  /\bdont\b/, /\bdo not\b/, /\bnot\b/, /\bnever\b/, // don't hang up / I'm not ready…
  /\bsaid\b/, /\bsays\b/, /\bsaying\b/, // my client said goodbye…
  /\bwould be\b/, // that would be all I need — can you also…
  /^(how|what|why|when|where|who|did|do|does|can|could|would|is|are)\b/, // question openers
];

function normalize(utterance: string): string {
  return utterance
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics: adiós -> adios
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:…"“”«»()\[\]{}—–]/g, ' ')
    .replace(/-/g, ' ') // bye-bye -> bye bye
    .replace(/'/g, '') // that's -> thats, i'm -> im, don't -> dont
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSoft(text: string, phrases: string[], fromStart: boolean): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const hit = phrases.find((p) => fromStart ? (out === p || out.startsWith(`${p} `)) : (out === p || out.endsWith(` ${p}`)));
    if (!hit) break;
    out = fromStart ? out.slice(hit.length).trim() : out.slice(0, out.length - hit.length).trim();
    if (!out) break;
  }
  return out;
}

/**
 * True only when the visitor's complete utterance IS a farewell —
 * nothing more, nothing attached. See the header for the contract and
 * src/test/farewell.test.ts for the pinned positive/negative matrix.
 */
export function detectFarewell(utterance: string): boolean {
  if (typeof utterance !== 'string') return false;
  // A question is never a goodbye, even a one-word one ("bye?").
  if (utterance.includes('?')) return false;
  const text = normalize(utterance);
  if (!text) return false;
  if (text.split(' ').length > FAREWELL_MAX_WORDS) return false;
  if (GUARDS.some((g) => g.test(text))) return false;
  const core = stripSoft(stripSoft(text, SOFT_PREFIXES, true), TRAILING_SOFT, false);
  if (!core) return false; // "thanks" / "ok" alone is not a goodbye
  return CORES.has(core) || COMBO.test(core);
}
