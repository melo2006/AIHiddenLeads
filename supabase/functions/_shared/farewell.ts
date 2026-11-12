// Visitor farewell detection for the Gemini Live proxy (Batch 1,
// 2026-11-12). D3 evidence: the visitor said goodbye five times,
// Aspen signed off five times, and the session never ended — the
// model has no way to hang up, so the proxy watches the visitor's
// COMPLETED utterances itself and, on a clear farewell, has Aspen
// give one brief closing line and then ends the session (see the
// turnComplete wiring in gemini-live-proxy).
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
