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

/** Grace after a POST-CLOSE repeated goodbye (farewell round 2,
 *  2026-11-14): the closing line was already delivered and the
 *  visitor is saying goodbye AGAIN — the session ends promptly,
 *  with just enough room for a trailing word to land. */
export const FAREWELL_REPEAT_END_DELAY_MS = 1500;

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
/**
 * True when the session config carries a whole-demo presenter stamp
 * (config.demoPresenter ∈ the presenter ids) — the same stamp
 * farewellSpeakerName resolves the banner name from. The proxy's
 * double-close gate (farewell-double-close fix, 2026-11-14) keys on
 * this predicate so its post-farewell output suppression applies to
 * exactly the presenter-fronted sessions the defect was proven on,
 * and to no Aspen-fronted or persona-segment session.
 */
export function hasPresenterStamp(
  config: { demoPresenter?: unknown } | null | undefined,
): boolean {
  const presenter = typeof config?.demoPresenter === 'string' ? config.demoPresenter : '';
  return PRESENTER_PERSONA_IDS.has(presenter);
}

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

// ---------------------------------------------------------------------------
// FAREWELL ROUND 2 (2026-11-14) — post-close classification.
//
// detectFarewell above is the FIRST-trigger detector, and it is
// deliberately conservative: a false positive hangs up on a visitor
// who wanted to keep talking. Once the closing line has actually
// been DELIVERED, the risk flips — the conversation is over from the
// speaker's side, and the failure mode becomes the goodbye LOOP
// (live proof, session 4f161ea7, Publish #52): the visitor repeated
// his goodbye three times ("Go ahead and hang up. I said goodbye.
// You're still there." / "…How come? You're not hanging up?" /
// "I said goodbye. Aren't you going to hang up?"), every repeat was
// a non-farewell under the conservative detector (the \bsaid\b
// reported-speech guard, the question form, the extra words), each
// one cancelled the armed end under the old any-speech-revives rule,
// and the session ran 428s until the visitor killed it himself.
//
// The two detectors below are used ONLY in that delivered state,
// never as a first trigger, and they answer different questions:
//   detectFarewellPersistence — "the visitor is STILL saying
//     goodbye" (repeats, complaints that the session has not ended,
//     demands to hang up). Wider than detectFarewell by design, but
//     still guarded: a prohibition ("don't hang up"), a not-ready,
//     third-party reported speech, or a new request riding along
//     all reject, and those fall through to revival in the proxy.
//   detectFarewellSoftClose — "politeness after the close" ("thank
//     you", "you too", "have a good day"): neither an end demand
//     nor a new topic. The proxy lets the armed end stand.
// ---------------------------------------------------------------------------

/** Longest utterance that can be post-close farewell persistence —
 *  complaints ramble more than clean goodbyes, so the cap is wider
 *  than FAREWELL_MAX_WORDS; beyond it, revival is the safer read. */
export const FAREWELL_PERSISTENCE_MAX_WORDS = 24;

// Farewell/complaint anchors: any ONE is enough, post-close. These
// are shapes detectFarewell rejects as a first trigger — reported
// first-person goodbyes, presence complaints, hang-up demands in
// question form — that unambiguously mean "end this" once the
// closing line has been delivered.
const PERSISTENCE_ANCHORS: RegExp[] = [
  /\bgoodbye\b/, /\bgood bye\b/, /\bbye\b/,
  /\bhang up\b/, /\bhung up\b/, /\bend (the )?call\b/, /\bend it\b/,
  /\bdisconnect( me)?\b/,
  /\bsee you\b/,
  /\bthats all\b/, /\bthat is all\b/,
  /\bim done\b/, /\bi am done\b/,
  /\bgotta go\b/, /\bhave to go\b/, /\bi need to go\b/, /\bi must go\b/,
  /\bstill there\b/, /\bstill on the (line|call|phone)\b/,
  /\bi (just |already )?said (goodbye|good bye|bye)\b/,
  /^i (just |already )?said$/, // bare trailing-off repeat: "I said…"
];

// Post-close rejects: the visitor does NOT want the end (yet), is
// reporting someone else's goodbye, or is attaching a new request.
const PERSISTENCE_GUARDS: RegExp[] = [
  /\b(dont|do not|never) (hang up|disconnect|end|say)\b/, // don't hang up / don't say goodbye
  /\bnot ready\b/, // I'm not ready to say goodbye
  /\b(im|i am) not done\b/, // I'm not done yet
  /\b(he|she|they) said\b/, // third-party reported speech
  /\b(my|the|our) [a-z]+ said\b/, // my client said… / the seller said…
  /\bgo (over|through)\b/, // go over the pricing ≠ go
  /\b(want|wanted) to ask\b/, /\bi have a question\b/, // a new request forming
  /\banother question\b/, /\bone more (thing|question)\b/,
  /\btell me\b/, /\bwhat about\b/, /\bhow about\b/,
];

// A question ABOUT THE ENDING is a complaint ("aren't you going to
// hang up?", "how come you're still there?"); a question about a
// TOPIC is a new request. The topic guard only bites when the
// utterance is a question and carries no ending-demand anchor.
const TOPIC_QUESTION = /\b(what|whats|when|where|which|who|how much|how many|how long|can you|do you|does|is there|are there)\b/;
const ENDING_DEMAND = /\b(hang up|hung up|hanging up|still there|still on|end (the )?call|disconnect)\b/;

/**
 * True when a POST-CLOSE utterance is the visitor still saying
 * goodbye — a repeat, a complaint that the session has not ended,
 * or a demand to hang up. ONLY meaningful after the closing line
 * has been delivered; never use it as a first farewell trigger
 * (detectFarewell owns that, conservatively).
 */
export function detectFarewellPersistence(utterance: string): boolean {
  if (typeof utterance !== 'string') return false;
  const text = normalize(utterance);
  if (!text) return false;
  if (text.split(' ').length > FAREWELL_PERSISTENCE_MAX_WORDS) return false;
  if (PERSISTENCE_GUARDS.some((g) => g.test(text))) return false;
  if (utterance.includes('?') && TOPIC_QUESTION.test(text) && !ENDING_DEMAND.test(text)) return false;
  return PERSISTENCE_ANCHORS.some((a) => a.test(text));
}

const SOFT_RESIDUES = new Set([
  'you too', 'same to you', 'take care', 'sounds good',
  'good day', 'have a good day', 'have a great day', 'have a wonderful day',
  'will do', 'much appreciated',
]);

/**
 * True when a POST-CLOSE utterance is only politeness/acknowledgement
 * — "thank you", "thanks so much", "you too", "have a good day".
 * Neither an end demand nor a new topic: the proxy lets the armed
 * farewell end stand (round 1 cancelled it on "thank you" — two
 * words, not a farewell — and stranded the session the same way).
 */
export function detectFarewellSoftClose(utterance: string): boolean {
  if (typeof utterance !== 'string') return false;
  if (utterance.includes('?')) return false;
  const text = normalize(utterance);
  if (!text) return false;
  if (text.split(' ').length > 8) return false;
  let core = stripSoft(stripSoft(text, SOFT_PREFIXES, true), TRAILING_SOFT, false);
  core = stripSoft(core, ['so much', 'very much'], false);
  return core === '' || SOFT_RESIDUES.has(core);
}

// Accumulations that plausibly GROW INTO a farewell/persistence
// utterance while the visitor is still mid-sentence ("go ahead…",
// "I said…", "you're still…"). The proxy's fragment-level cancel
// defers on these and lets the completed-utterance classification
// at turnComplete decide; a genuine new topic grows past them and
// cancels on a later fragment instead.
const LEAD_INS: ReadonlySet<string> = new Set([
  'go', 'go ahead', 'go ahead and',
  'i', 'i said', 'i just said', 'i already said',
  'youre still', 'you are still', 'are you still', 'still',
  'hang', 'please hang', 'just hang', 'end the',
  'thats', 'that is', 'see you', 'im', 'i am',
]);

/**
 * True when a (possibly partial) post-close utterance is a farewell
 * lead-in — a known complaint opener, or an accumulation ending on
 * a farewell-forming word ("…still", "…said", "…hang"). Used by the
 * proxy's fragment-level cancel so a complaint still being spoken
 * cannot cancel the armed end before it is complete.
 */
export function detectFarewellLeadIn(utterance: string): boolean {
  if (typeof utterance !== 'string') return false;
  const text = normalize(utterance);
  if (!text) return false;
  if (LEAD_INS.has(text)) return true;
  return /(?:^|\s)(still|said|hang)$/.test(text);
}
