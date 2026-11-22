// The DISCOVERY GATE for presenter realtor sessions (Publish #78,
// 2026-11-15).
//
// THE DEFECTS (live-verified in the Publish #72 verification rerun,
// ~/workspace/publish72-verification-2026-11-15.md, recovery section
// — the first run in which #72's behavior was observable at all):
//
//  B (short-circuit) FAIL: the visitor banked purpose, then pushed
//  to skip — "That's everything — just send me the list." Frank
//  answered with a CONTACT ask (name, email, phone) instead of the
//  SHORT GATE #72 designed for exactly that moment: recap what is
//  banked, "Did I capture that all correctly?", the caller's yes —
//  and only then the promise and the capture. The visitor's "Yes,
//  that's right" then had no recap to attach to, and Frank simply
//  repeated the capture ask.
//  D (stated budget) FAIL: the visitor volunteered purpose and a
//  clearly stated $300–400k budget in his first breath — and Frank
//  looped on the NAME for four consecutive turns ("May I have your
//  name, so I can greet you properly?"), never confirming the
//  budget, never recapping anything. The visitor never gave a
//  name; the receptionist segment's name beats (host beat 0, the
//  capture take, beat 6) are scripted as a sequence the model
//  would not leave while their precondition — a name — was unmet,
//  and every criteria answer the visitor gave was answered with
//  the name ask again. The discovery arc starved behind an
//  optional courtesy.
//  A (purpose-first) PARTIAL: the purpose question now fires (the
//  #72 fix works), but in the same session the entry sequence ran
//  as a rigid beat list across the host→receptionist boundary: the
//  visitor gave his name at host beat 0 ("I'm Tony", thanked by
//  name), and the receptionist segment's beat 5/6 still delivered
//  a greeting-shaped overview opener and re-asked the name at
//  beat 6. Investigation note: NO persona-segment swap is involved
//  on this path — a presenter fronts the demo solo, host and
//  receptionist beats composed into ONE session (personas.ts
//  presenterSimulationPrompt) — so the "segment transition" that
//  dropped the settled state is the prompt-internal boundary
//  between SIMULATION_HOST_SEGMENT and
//  SIMULATION_RECEPTIONIST_SEGMENT, and the state it dropped (the
//  banked name, the delivered greeting) is exactly the state this
//  gate tracks mechanically.
//
// THE PATTERN (the #70/#74 lesson, third application): prompt
// policy prose holds mid-flow but fails at transitions and at
// scripted-beat boundaries, so the obligations are enforced HERE,
// by the proxy — which can see the visitor's own words and the
// model's own turns, and does not need the model's goodwill to
// compare them. This module owns detection + the state machine +
// the directive wording; gemini-live-proxy owns the wiring,
// exactly like _shared/capture-gate.ts. It arms ONLY on presenter
// realtor sessions (config.demoPresenter stamped by gemini-session
// for the pinned realtor examples, and never on a persona
// segment): every other session's proxy behavior is untouched.
//
// WHAT THE GATE ENFORCES, in the turn-boundary decision's priority
// order (at most one injection per boundary):
//  1. THE SHORT GATE AT THE SKIP: a push-to-skip (or an explicit
//     read-back request — the caller's own wrap-up, which #72's
//     core-four rule says always overrides the pass) makes the
//     gate OWED. If the answering turn does not run it (no "Did I
//     capture that all correctly?"), the boundary injects the
//     order: recap only what is banked (open dimensions named
//     open), the gate question, wait — and only after the yes, the
//     promise, then the capture. With NOTHING banked, the order
//     names the one missing keystone instead: the purpose choice,
//     asked once, briefly — never a contact ask at that moment.
//  2. A BANKED NAME IS NEVER RE-ASKED: the name is banked from the
//     session's seed facts (the captured-contact store, the
//     invite/visitor name, a predecessor session's recap) or from
//     the visitor's own introduction the moment it is spoken. A
//     model turn that asks for it anyway earns the correction —
//     the name, stated as held — at most twice.
//  3. THE NAME IS OPTIONAL — THE LOOP RELEASE: a name asked
//     standalone twice with no name given is a CLOSED question.
//     The boundary orders the presenter to proceed without one —
//     take up what the visitor actually said and run the arc —
//     and a third standalone ask earns one sterner repeat of the
//     same order. (The close's single bundled capture ask — name
//     WITH email and phone — is a different beat and is never
//     counted as a standalone ask; this release does not touch it.)
//  4. A STATED BUDGET IS BANKED, NEVER RE-OPENED: a budget stated
//     in the visitor's own words (digits or number-words, anchored
//     on a money context) is banked on first statement. The Q7
//     bracket offer after it earns a one-time correction; and when
//     the gate runs, a recap that omits the stated budget earns a
//     one-time order to re-run the recap complete — the promise
//     may not rest on a recap that dropped a banked criterion.
//  5. THE GREETING HAPPENS ONCE — MECHANICALLY: in-role greetings
//     are counted from the model's own turns; a second one earns a
//     one-time correction. (The discovery layer's step-0 rule says
//     this in prose; the count is what makes it stick across the
//     host→receptionist boundary.)
//
// FALSE-POSITIVE DISCIPLINE (a gate that interrupts a clean
// session is itself a defect): detection reads the visitor's
// completed utterances and the model's completed turns only; the
// name detector rejects the conversational shapes that merely
// follow "I'm" ("I'm looking for a home" banks nothing); the
// budget detector requires a money anchor, so beds, baths and
// garage counts can never bank as a budget; the skip detector is
// anchored on list/send/wrap-up language; the decision is blocked
// at exactly the moments the capture gate's is (preview, a
// farewell that owns the close, a connecting transfer, an
// on-screen card) AND stands down on any boundary where the
// capture gate or the consent ask already injected, so directives
// never stack; every injection kind is capped, and a session that
// burns through them simply proceeds ungated — the failure mode
// is an unguided conversation, never a fabricated fact. The gate
// NEVER touches the #74 capture gate's behavior: it runs after
// it, on a separate state, and its stand-down rule is what keeps
// the two from ever competing for a turn.

// PUBLISH #80 (2026-11-15) — the #78 verification
// (~/workspace/publish78-verification-2026-11-15.md) proved the
// design CAN execute (check B2's second push ran the gate
// verbatim, promise-then-capture in order) but the gate missed
// its TRIGGERS in three states, all of the same family: every
// #78 order was ONE-SHOT — fired once, marked spent, and never
// verified against the model's next turn. Four trigger fixes:
//
//  1. B (banked) still failed with the pre-#78 shape: the
//     short-gate order fired at the push, the model's answering
//     turn was the bundled capture ask, the visitor's "Yes,
//     that's right" was then read as a DECLINE of that ask — and
//     the spent order never landed. (The verification's guess
//     that purpose had not banked does not reproduce: banking is
//     a fold over the visitor's own words, model-independent,
//     and the script's line banks. The miss was the one-shot
//     order.) FIX: orders PERSIST until observably complied
//     with — the short-gate order re-fires once, sterner, at the
//     next boundary where the gate still has not run (cap 2 per
//     push, mirroring the name-release discipline), and a fresh
//     push re-arms as before.
//  2. D: the gate recap ran with the banked $300–400k budget
//     MISSING. The #78 completeness correction did fire at the
//     recap boundary — but the observe step had already marked
//     the gate SATISFIED (gateAsked set, debt cleared) on the
//     strength of the question alone, so the visitor's confirm
//     boundary had nothing left to fire and the yes was accepted
//     on a void recap. FIX: a gate recap is judged COMPLETE or
//     VOID on the recap turn itself, against the folded ledger —
//     a banked headline criterion dropped (budget, purpose), or
//     a specific view asserted that the visitor never stated,
//     VOIDS the recap: the debt stands, the visitor's answer to
//     it cannot discharge it, and the completeness correction
//     fires (and re-fires once) until a complete recap runs.
//     Also: an in-flow acknowledgment that collapses a stated
//     RANGE to its top end ("that four hundred thousand dollar
//     ballpark") earns its own one-time correction — a range is
//     repeated as a range.
//  3. B2 push-1: with nothing banked, the push landed DURING the
//     host beats and the answering turn was the simulation-entry
//     transition — the purpose keystone order fired into a turn
//     that structurally could not obey it and was spent. FIX
//     (the #74 capture-gate family pattern): an order whose
//     answering turn signals the simulation entry is CARRIED —
//     it does not consume a fire — and re-fires at the first
//     post-transition boundary if the owed move still has not
//     happened. And when the model's own turn asks the purpose
//     question with nothing banked, the keystone counts as
//     DELIVERED: no injection, the order marked counted.
//  4. (In capture-gate.ts) the hybrid spell-back — see there.

// PUBLISH #82 (2026-11-15) — the #80 verification
// (~/workspace/publish80-verification-2026-11-15.md) cleared D, C
// and P, and left ONE family standing: at the push-to-skip
// boundary, the presenter's built-in beats still beat the gate.
// Three fixes, each pinned against the verification's exact
// transcripts (replayed through the pre-#82 decision during the
// build — the traces below are what the code demonstrably did):
//
//  1. B (banked): at the push, Frank answered with the step-2
//     CHANNEL ask ("would you prefer an email or a mobile number
//     for the link?"); the next turn brought a SECOND capture ask
//     ("What is the best email address to send that to?"). The
//     pre-#82 decision had NO capture-ask detector at all: both
//     turns were generic non-compliance, and they consumed the
//     order's whole per-push budget (fires at the push and the
//     confirm boundaries) — at the read-back boundary the gate
//     returned null with the debt still owed, permanently. FIX:
//     a capture/channel ask produced while the gate is owed (with
//     criteria banked) is a GATE VIOLATION — a distinct correction
//     that names the pre-emption (the step-2 beat does not run
//     while the gate is owed; details given in answer to it do
//     not discharge the gate), on its OWN per-push budget, so a
//     violating turn can never again spend the order's: the
//     recap+gate order persists until a recap+gate turn actually
//     occurs. The #72 amendment is untouched: in NON-push flow
//     (gate not owed) the step-2 ask is classified but never a
//     violation, exactly as designed.
//  2. B2 (nothing banked): the host→simulation transition
//     STRADDLED TWO TURNS — transition text, then the in-role
//     greeting — and the visitor's "To live in" was answered by
//     the greeting turn. The fold itself banked the purpose at
//     that boundary (the ledger folds visitor utterances; the
//     trace shows purposeBanked=true) — but the #80 carry only
//     recognized entry-SIGNAL text, and the greeting carries
//     none, so the greeting boundary CONSUMED the carried order
//     as a counted fire and cleared the carry. FIX: while a carry
//     is outstanding, an in-role greeting turn is still inside
//     the transition window — the fire is carried across it too,
//     not counted — bounded by GATE_ORDER_MAX_CARRY_TURNS
//     consecutive carried turns, after which fires count
//     normally. The keystone now survives a straddle of any
//     length up to the bound, whether or not the purpose answer
//     arrives inside the greeting turn.
//  3. The doorway name re-ask (seen in #78's E rerun and #80's
//     B run): "May I have your name, so I can greet you properly?"
//     delivered to a visitor whose name was given at the doorway
//     and used by the host itself. The #78/#80 name-known
//     correction fires only AFTER a re-ask is spoken. FIX, two
//     layers: (a) in the gate — the moment a name is held
//     (seeded at arming, or banked from the visitor's own words)
//     and no turn has asked for it yet, the decision injects the
//     name-held order PRE-EMPTIVELY, at that boundary, before
//     the script's later name beat can fire; the after-the-fact
//     correction remains as the second line. (b) in the
//     composition — presenterSimulationPrompt renders the
//     receptionist segment's name beat in its satisfied form
//     when gemini-session composes with a seeded visitor name,
//     so the ask is not in the script at all; with no seeded
//     name the composed prompt is byte-identical to before.

// PUBLISH #87 (2026-11-22) — Ron's Aurelia Perez test calls
// (records 27c58682 + 7dae3a37): the #78–#82 ledger covered the
// name, the purpose, the budget and the greeting — and the live
// failures moved to everything it did NOT track:
//  1. THE ENTRY RE-RAN MID-CONVERSATION: inside one unbroken
//     487s session, minutes into substantive discovery, the
//     presenter executed the whole simulation entry again — name
//     ask, announcement, framing, in-role greeting. (The session
//     had opened as a resume — the mint's recap synthesis, fixed
//     in gemini-session the same day — so the entry had never run
//     at the start and sat latent in the prompt until a fragment
//     turn broke the model's thread.) The gate now treats an
//     entry signal on an entered session — or a first entry
//     signal arriving LATE, after criteria are banked — as a
//     re-run and corrects it; a step-out announcement re-arms the
//     one legitimate re-entry.
//  2. QUALIFICATION AMNESIA: areas, property type, beds/baths and
//     the view were re-asked after being answered — areas three
//     times. The ledger now banks every discovery dimension (a
//     stated answer, or a substantive answer to that dimension's
//     own question — a wave-off banks as answered-open, per the
//     discovery layer), and a question about a banked dimension
//     earns the settled-fact correction naming the caller's own
//     answer.
//  3. THE NO-MATCH LOOP: "I don't have a match" three times, the
//     send-the-list close and the capture never fired. A no-match
//     that lands with the core criteria complete — or repeated
//     with NO new criterion banked since the last one — owes the
//     close: the gate debt arms with the no-match flag and the
//     order is the close order (recap + gate question, then the
//     promise, then the one capture ask), so the loop terminates
//     mechanically instead of by the model's goodwill.
//  4. THE SECOND TRANSFER DEMAND: answered twice with the same
//     honesty line (and a mutating target). The gate counts the
//     visitor's transfer demands; the second one converts to the
//     callback-capture fallback order, naming the pack's agent —
//     the target the proxy supplies — as the consistent target.

import { sanitizeVisitorName } from './voice-config.ts';
import { turnSignalsSimulationEntry } from './capture-gate.ts';

/** Total discovery-gate directives one session will inject.
 * (Publish #87: raised from 6 — the extended ledger's families
 * (entry re-run, settled facts, no-match close, transfer
 * fallback) each carry their own small caps, and a session that
 * needs several of them must not starve the later ones.) */
export const DISCOVERY_GATE_MAX_FIRES = 12;

/** Gate-violation corrections one push episode will inject
 * (Publish #82): the violation has its own budget so a violating
 * turn can never spend the short-gate order's — the order
 * persists until a recap+gate turn actually occurs. */
export const GATE_VIOLATION_MAX_FIRES = 3;

/** Consecutive transition-window turns a short-gate order may
 * be carried across without counting (Publish #82): the sane
 * bound on the straddle — a host→simulation entry that takes
 * more turns than this is no longer a straddle, and fires start
 * counting so the order's persistence budget is spent in the
 * open, where the later rules can see it. */
export const GATE_ORDER_MAX_CARRY_TURNS = 3;

// ---------------------------------------------------------------------------
// Visitor-utterance detectors
// ---------------------------------------------------------------------------

// Words that follow "I'm" / "this is" in ordinary conversation and
// are never a name: the introduction patterns below bank a name
// only when the captured word survives this list. Deliberately
// broad — a missed name costs one ask; a banked non-name ("I'm
// Looking") would poison every later directive.
const NAME_NON_NAMES: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'my', 'we', 'i', 'you', 'it', 'he', 'she', 'they',
  'and', 'but', 'then', 'now', 'today', 'there', 'everyone', 'everybody',
  'looking', 'interested', 'calling', 'trying', 'just', 'not', 'here',
  'fine', 'good', 'okay', 'ok', 'yes', 'yeah', 'no', 'sure', 'ready',
  'back', 'sorry', 'afraid', 'wondering', 'hoping', 'searching',
  'moving', 'selling', 'buying', 'investing', 'browsing', 'testing',
  'checking', 'curious', 'new', 'from', 'with', 'on', 'in', 'at', 'so',
  'well', 'hi', 'hello', 'hey', 'thanks', 'thank', 'please', 'about',
  'after', 'before', 'going', 'getting', 'seeing', 'asking', 'telling',
  'leaving', 'staying', 'working', 'living', 'planning', 'thinking',
  'glad', 'happy', 'great', 'wonder', 'hope', 'sitting', 'driving',
  'walking', 'watching', 'listening',
]);

const NAME_TOKEN = /[A-Za-z][A-Za-z'’-]+/;

/** One name word, cleaned, or '' when the word is not a name. */
function nameWord(raw: string): string {
  const w = (raw || '').trim().replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, '');
  if (w.length < 2) return '';
  if (NAME_NON_NAMES.has(w.toLowerCase())) return '';
  return w;
}

/** Up to two name words from the start of `rest`, or ''. */
function nameFromRest(rest: string): string {
  const parts = (rest || '').trim().split(/\s+/).slice(0, 2);
  const first = nameWord(parts[0] || '');
  if (!first) return '';
  const second = parts.length > 1 ? nameWord(parts[1]) : '';
  return second ? `${first} ${second}` : first;
}

/**
 * The name the visitor states in this utterance, or ''. Only the
 * explicit introduction shapes count — "my name is X", "I'm X",
 * "this is X", "X here" at the start — each guarded by the
 * non-name list, so "I'm looking for a home" and "this is a great
 * site" bank nothing. (The bare-reply shape — a one-or-two-word
 * answer to a name ask — is judged by the state machine, which
 * knows a name ask was outstanding; see bareReplyName.)
 */
export function detectStatedName(text: string): string {
  if (!text) return '';
  const t = text.trim();
  let m = t.match(/\bmy name is\s+(.+)$/i);
  if (m) return nameFromRest(m[1]);
  m = t.match(/\b(?:i'm|i am)\s+(.+)$/i);
  if (m) return nameFromRest(m[1]);
  m = t.match(/\bthis is\s+(.+)$/i);
  if (m) return nameFromRest(m[1]);
  m = t.match(/^(.{2,40}?)\s+here\b/i);
  if (m && !/\b(we|i|you|it|they|he|she)\b/i.test(m[1])) return nameFromRest(m[1]);
  return '';
}

/**
 * A bare reply to an outstanding name ask: the WHOLE utterance is
 * one or two plain name words ("Tony.", "Tony Miller") and nothing
 * else. Judged only when the previous model turn asked for the
 * name — in any other position a two-word utterance is
 * conversation, not an introduction.
 */
export function bareReplyName(text: string): string {
  if (!text) return '';
  const t = text.trim().replace(/[.!?,]+$/g, '');
  if (!t || /\d/.test(t)) return '';
  const parts = t.split(/\s+/);
  if (parts.length > 2) return '';
  if (!parts.every((p) => NAME_TOKEN.test(p))) return '';
  return nameFromRest(t);
}

/**
 * A push to skip ahead / wrap up: list-and-send language, a
 * that's-everything wrap, or an explicit hurry. Anchored shapes
 * only — a caller still discovering ("send me more photos of that
 * one" is about a listing, and does not match: the anchors require
 * the list / everything / wrap-up / skip forms below).
 */
export function detectPushToSkip(text: string): boolean {
  if (!text) return false;
  return /\b(just send me|send me the list|send me what you have|just show me|show me the list|that'?s everything|that is everything|that'?s all i (have|need)|that'?s all we (have|need)|wrap (this|it) up|can we wrap|skip (ahead|the questions|to the list)|enough questions|get to the list|i'?m in a hurry|in a rush now)\b/i.test(text);
}

/**
 * An explicit read-back / recap request — the caller asking for
 * the criteria to be played back IS a wrap-up move under #72's
 * design (the caller's own wrap-up always overrides the pass), so
 * it owes the same gate as a push to skip.
 */
export function detectRecapAsk(text: string): boolean {
  if (!text) return false;
  return /\b(read (it|that|them|the criteria|the areas)? ?back|read back|can you recap|recap (for me|what you)|what (do you|have you) have for me|what criteria (do you|have you) have)\b/i.test(text);
}

/** Purpose stated, in the caller's own words (any of the shapes
 * the discovery layer names as banking purpose). Banking is a
 * fold over the visitor's words ONLY — whether the model re-asks
 * the purpose question over a volunteered statement can never
 * un-bank it (Publish #80, defect 1: the ledger, not the model's
 * behavior, is the truth). */
export function detectPurposeStated(text: string): boolean {
  if (!text) return false;
  return /\b(to live in|live in it|live there|for (myself|ourselves|my family|us)|primary (home|residence)|move in|moving in|relocat|flip|rent (it )?out|landlord|investment|invest(ing|or)?|second home|vacation home|retire|downsiz|upsiz)/i.test(text);
}

/**
 * A specific view / setting the visitor stated as a criterion
 * (Publish #80): banked so the gate's recap judgment can tell a
 * stated view from an inserted one. Visitor utterances only.
 */
export function detectStatedView(text: string): boolean {
  if (!text) return false;
  return /(waterfront|ocean view|water view|golf view|lake view|canal view|river view|bay view|intracoastal)/i.test(text);
}

/** Property type / feature signals — the content half of "anything
 * banked at all" for the skip decision. */
export function detectTypeOrFeature(text: string): boolean {
  if (!text) return false;
  return /\b(single-family|townhouse|townhome|condo|house|duplex|bedroom|beds?|baths?|garage|waterfront|ocean view|golf view|pool|yard|acre|beach)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Publish #87 detectors — the rest of the discovery ledger (2026-11-22)
// ---------------------------------------------------------------------------

// Words that can follow a place preposition at the start of a
// captured phrase without being a place: pronouns, articles and
// the conversational nouns that ride "in/for/to" in ordinary
// speech ("in a hurry", "for myself", "in touch"). A missed area
// costs one un-corrected re-ask; a banked non-place ("In Hurry")
// would poison the recap summary — the list errs broad.
const AREA_NON_PLACES: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'it',
  'there', 'here', 'touch', 'general', 'particular', 'hurry', 'rush', 'doubt', 'mind',
  'line', 'charge', 'control', 'trouble', 'luck', 'fact', 'case', 'point', 'way',
  'front', 'back', 'touch', 'touch', 'sales', 'cash', 'full', 'half', 'about',
  'myself', 'yourself', 'ourselves', 'us', 'me', 'you', 'him', 'them', 'need',
  'search', 'area', 'areas', 'market', 'touch',
]);

const AREA_PATTERN = /\b(?:in|around|near|for|to)\s+([A-Z][a-zA-Z'’-]+(?:\s+(?:[A-Z][a-zA-Z'’-]+|Beach|Isles|Park|Ridge|Grove|Manors|Point|Hills|Gardens|Lakes|Shores|Bay|Creek|Harbor|Harbour|Island|Islands)){0,2})/g;

/**
 * The areas the visitor named in this utterance, in their own
 * words ("anything in Fort Lauderdale" → ["Fort Lauderdale"]).
 * Conservative by construction: a place must be CAPITALIZED and
 * follow a place preposition — the shapes a caller uses when
 * naming where they want to live. Sentence fragments, lowercase
 * speech and pronoun-led phrases bank nothing.
 */
export function detectStatedAreas(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(AREA_PATTERN)) {
    const phrase = (m[1] || '').trim();
    if (!phrase) continue;
    const first = phrase.split(/\s+/)[0].toLowerCase();
    if (AREA_NON_PLACES.has(first)) continue;
    if (!out.some((a) => a.toLowerCase() === phrase.toLowerCase())) out.push(phrase);
  }
  return out;
}

/**
 * The property-type answer in this utterance, as a short label,
 * or '' — a named type ("a condo", "single-family"), or the
 * answered-open shapes the discovery layer banks as settled ("any
 * type", "either works", "doesn't matter"). A generic "home" is
 * NOT a type answer.
 */
export function detectStatedType(text: string): string {
  if (!text) return '';
  const t = text.toLowerCase();
  if (/\b(any type|either type|any of (them|those)|all of (them|those)|doesn'?t matter|don'?t mind|i'?m flexible|flexible on (the )?type|open to (any|all|either))\b/.test(t)) return 'any type (open)';
  const m = t.match(/\b(single[- ]family(?: home)?|townhouse|townhome|condo|duplex|house)\b/);
  return m ? m[1] : '';
}

/** Beds and/or baths stated in this utterance — a counted bed or
 * bath ("two bedroom", "2 baths"), or the pair named together. */
export function detectStatedBedsBaths(text: string): boolean {
  if (!text) return false;
  return /\b(\d+|one|two|three|four|five|six)\s*(?:bed|bedroom|bath|bathroom)/i.test(text)
    || /\bbeds?\s*(?:and|&)\s*baths?\b/i.test(text);
}

const BEDS_BATHS_SPAN = /(?:\d+|one|two|three|four|five|six)\s*(?:bed|bedroom|bath|bathroom)/gi;

/** The caller's beds/baths as their own span — first counted
 * shape through the last ("two bedroom, two baths") — or ''. */
export function detectStatedBedsBathsLabel(text: string): string {
  if (!text) return '';
  const matches = [...text.matchAll(BEDS_BATHS_SPAN)];
  if (!matches.length) return '';
  const first = matches[0];
  const last = matches[matches.length - 1];
  const start = first.index ?? 0;
  const end = (last.index ?? 0) + last[0].length;
  return text.slice(start, end).trim();
}

/** The specific view phrase the visitor stated ("water view"),
 * or '' — the phrase half of detectStatedView. */
export function detectStatedViewPhrase(text: string): string {
  if (!text) return '';
  const m = text.match(/(waterfront|ocean view|water view|golf view|lake view|canal view|river view|bay view|intracoastal)/i);
  return m ? m[0] : '';
}

/**
 * An explicit transfer demand in the visitor's own words — transfer
 * me, speak/talk to a human / manager / owner / agent / director,
 * a real person. Anchored shapes only: "talk to me about…" and
 * other conversational uses bank nothing.
 */
export function detectTransferDemand(text: string): boolean {
  if (!text) return false;
  return /\b(transfer me|transfer to|put me through|speak to (a |an |the )?(human|person|manager|owner|agent|director|someone|somebody|representative)|talk to (a |an |the )?(human|person|manager|owner|agent|director|someone|somebody|representative)|get me (a |an |the )?(human|person|manager|owner|agent|director|someone|somebody)|real person|actual person|human being|the sales director|a sales director)\b/i.test(text);
}

// Number expressions that carry SCALE — a bare count ("three
// bedrooms") is never an amount; an amount needs a hundred /
// thousand / million / k / $ shape.
const AMOUNT = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|thousand|million)?|\d[\d,]*(?:\.\d+)?\s?(?:k\b|thousand|million)|(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|half)\s+){1,4}(?:thousand|million)|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+hundred\b/gi;
// A money context must anchor the utterance before any amount in
// it counts as a budget — this is what keeps "one hundred
// percent" and "a hundred photos" out of the ledger.
const MONEY_ANCHOR = /(budget|\$|dollar|thousand|million|\d\s?k\b|grand\b)/i;

/**
 * The budget the visitor stated in this utterance, as the exact
 * span of their own words (first scaled amount through the last,
 * so a range keeps both ends: "three hundred to four hundred
 * thousand"), or ''. Conservative by construction: a scaled
 * amount AND a money anchor must both be present.
 */
export function detectStatedBudget(text: string): string {
  if (!text || !MONEY_ANCHOR.test(text)) return '';
  const matches = [...text.matchAll(AMOUNT)];
  if (!matches.length) return '';
  const first = matches[0];
  const last = matches[matches.length - 1];
  const start = first.index ?? 0;
  const end = (last.index ?? 0) + last[0].length;
  return text.slice(start, end).trim();
}

const NUMBER_WORD_DIGITS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', fifteen: '15', twenty: '20',
  thirty: '30', forty: '40', fifty: '50', sixty: '60',
  seventy: '70', eighty: '80', ninety: '90',
};

/**
 * Does this model turn mention the banked budget? Judged on the
 * budget's own salient tokens — its digit runs, or its word-form
 * amounts read as digit equivalents — so "up to about 400" and
 * "four hundred thousand" both count as mentioning a stated
 * "three hundred to four hundred thousand", while a recap that
 * drops the figure entirely does not.
 */
export function budgetMentionedInTurn(turnText: string, budget: string): boolean {
  if (!turnText || !budget) return false;
  const turn = turnText.toLowerCase();
  const phrase = budget.toLowerCase();
  // Digit forms: any digit run of the phrase, commas stripped,
  // appearing in the turn's digit stream or as number words.
  const phraseDigits = (phrase.match(/\d[\d,]*/g) || []).map((d) => d.replace(/,/g, ''));
  const turnDigits = turn.replace(/,/g, '');
  if (phraseDigits.some((d) => d.length >= 2 && turnDigits.includes(d))) return true;
  // Word forms: the phrase's LAST amount (the figure a recap
  // names) checked word-for-word, and as its digit equivalent
  // ("four hundred" → "400").
  const amounts = [...phrase.matchAll(AMOUNT)];
  if (!amounts.length) return false;
  const lastWords = amounts[amounts.length - 1][0].trim().split(/\s+/);
  const wordSeq = lastWords.join(' ');
  if (turn.includes(wordSeq)) return true;
  const lead = NUMBER_WORD_DIGITS[lastWords[0]];
  if (lead && lastWords.includes('hundred') && turnDigits.includes(`${lead}00`)) return true;
  if (lead && lastWords.includes('thousand') && turnDigits.includes(`${lead}000`)) return true;
  return false;
}

/** The individual amounts inside a banked budget phrase, in
 * order ("three hundred to four hundred thousand" → ["three
 * hundred", "four hundred thousand"]). */
export function budgetAmounts(budget: string): string[] {
  if (!budget) return [];
  return [...budget.toLowerCase().matchAll(AMOUNT)].map((m) => m[0].trim()).filter(Boolean);
}

/**
 * Does this turn mention ONE specific amount (word form, digit
 * form, or digit equivalent)? The per-amount companion of
 * budgetMentionedInTurn, which keeps its own pinned semantics
 * (it judges the phrase by its last amount).
 */
export function amountMentionedInTurn(turnText: string, amount: string): boolean {
  if (!turnText || !amount) return false;
  const turn = turnText.toLowerCase();
  const phrase = amount.toLowerCase().trim();
  const digits = (phrase.match(/\d[\d,]*/g) || []).map((d) => d.replace(/,/g, ''));
  const turnDigits = turn.replace(/,/g, '');
  if (digits.some((d) => d.length >= 2 && turnDigits.includes(d))) return true;
  if (phrase && turn.includes(phrase)) return true;
  const words = phrase.split(/\s+/);
  const lead = NUMBER_WORD_DIGITS[words[0]];
  if (lead && words.includes('hundred') && turnDigits.includes(`${lead}00`)) return true;
  if (lead && words.includes('thousand') && turnDigits.includes(`${lead}000`)) return true;
  return false;
}

/**
 * Does this turn carry the banked budget IN FULL — every amount
 * of it? The recap judgment's standard (Publish #80): a recap
 * that names only one end of a stated range has not carried the
 * budget, whichever end it named.
 */
export function budgetFullyMentionedInTurn(turnText: string, budget: string): boolean {
  const amounts = budgetAmounts(budget);
  if (!amounts.length) return budgetMentionedInTurn(turnText, budget);
  return amounts.every((a) => amountMentionedInTurn(turnText, a));
}

/**
 * Did this turn COLLAPSE a stated range — naming its last (top)
 * amount while dropping the first? The live D acknowledgment:
 * budget "three hundred to four hundred thousand" answered with
 * "that four hundred thousand dollar ballpark". A turn that
 * carries the full range, or neither end, is not a collapse.
 */
export function budgetRangeCollapsedInTurn(turnText: string, budget: string): boolean {
  const amounts = budgetAmounts(budget);
  if (amounts.length < 2) return false;
  return amountMentionedInTurn(turnText, amounts[amounts.length - 1])
    && !amountMentionedInTurn(turnText, amounts[0]);
}

// ---------------------------------------------------------------------------
// Model-turn detectors
// ---------------------------------------------------------------------------

const NAME_ASK = /(who do i have the pleasure of speaking with|may i have your name|can i have your name|what'?s your name|what is your name|your name,? so i can greet you)/i;

/** This model turn asks for the visitor's name (any form —
 * including the close's bundled capture ask). */
export function turnAsksForName(text: string): boolean {
  return NAME_ASK.test(text || '');
}

/**
 * This model turn asks for the name STANDALONE — the name beat on
 * its own, not bundled with an email/phone ask. The D-loop turns
 * were standalone; the close's one capture ask is bundled, and is
 * a different beat that the name release never counts.
 */
export function turnAsksForNameStandalone(text: string): boolean {
  if (!turnAsksForName(text)) return false;
  return !/(e-?mail|phone|mobile|number)/i.test(text || '');
}

/**
 * This model turn is an in-role greeting: a time-of-day greeting
 * together with the thank-you-for-calling shape, in one turn. The
 * host's demo greeting does not carry the thank-you-for-calling
 * shape and never counts; the beat-4 greeting and every warm
 * opening variant do.
 */
export function turnIsInRoleGreeting(text: string): boolean {
  if (!text) return false;
  return /good (morning|afternoon|evening)/i.test(text) && /(thank you|thanks) (so much )?for calling/i.test(text);
}

/** This model turn asked the confirm-gate question. */
export function turnAsksGateQuestion(text: string): boolean {
  return /did i capture that all correctly/i.test(text || '');
}

/** This model turn offered the Q7 bracket question — legitimate
 * only while no budget is banked. */
export function turnOffersBracket(text: string): boolean {
  return /(up to about five hundred|closer to a million|up to five hundred)/i.test(text || '');
}

/**
 * Does this model turn MENTION the purpose (for the recap
 * completeness judgment)? Wider than the banking detector: a
 * recap may phrase the purpose loosely ("living in it", "for
 * yourself") and still carry it. Judged only on gate-question
 * turns.
 */
export function turnMentionsPurpose(text: string): boolean {
  if (!text) return false;
  if (detectPurposeStated(text)) return true;
  return /\b(living in|live in|for yourself|long[- ]term hold)\b/i.test(text);
}

/**
 * Does this model turn ASSERT a specific view as the caller's
 * criterion (for the recap completeness judgment)? The mirror
 * image of a dropped criterion (Publish #80, check C's
 * softness): a recap that presents a view the visitor never
 * chose. A negated mention ("no water view needed") and a view
 * named as still open are not assertions. Judged only on
 * gate-question turns.
 */
export function turnAssertsSpecificView(text: string): boolean {
  if (!text) return false;
  const shape = /(waterfront|ocean view|water view|golf view|lake view|canal view|river view|bay view|intracoastal)/gi;
  for (const m of text.matchAll(shape)) {
    const at = m.index ?? 0;
    const before = text.slice(0, at).toLowerCase().split(/[^a-z']+/).filter(Boolean).slice(-5);
    if (before.some((w) => ['no', 'not', 'without', 'never', "isn't", "aren't", "don't", 'nope'].includes(w))) continue;
    const after = text.slice(at + m[0].length).toLowerCase().split(/[^a-z']+/).filter(Boolean).slice(0, 3);
    if (after.includes('still') && after.includes('open')) continue;
    return true;
  }
  return false;
}

/**
 * Does this model turn ask the PURPOSE question — the choice the
 * nothing-banked keystone order exists to elicit (Publish #80,
 * defect 3)? Conservative shapes: the sell-or-buy choice, the
 * live-in/flip/rent choice, "what the home is for". When the
 * gate is owed with nothing banked and this turn asks it, the
 * keystone counts as delivered.
 */
export function turnAsksPurposeQuestion(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return /(selling|sell)\b[^.?!]{0,80}\b(buy|buying)\b/.test(t)
    || /\b(buy|buying)\b[^.?!]{0,80}\b(selling|sell)\b/.test(t)
    || /what (the|is your) (home|house|property) is for/.test(t)
    || /\blive in\b[^.?!]{0,60}\b(flip|rent|invest)/.test(t)
    || /\bpurpose\b[^.?!]{0,40}\?/.test(t);
}

/**
 * Does this model turn ask the PURPOSE CHOICE itself — the
 * live-in / flip / rent-out question (Publish #87)? Narrower than
 * turnAsksPurposeQuestion: the buy-or-sell OPENER is a different
 * question (it sorts the road), and re-asking IT after the road
 * is chosen is judged by the conversation, not this detector —
 * the settled-fact correction for purpose keys on the choice.
 */
export function turnAsksPurposeChoice(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  // Question shapes only — an alternative must be offered. The bare
  // phrase "a home to live in" is NOT a question: the model's own
  // acknowledgment ("Got it, a home to live in.") echoes it, and an
  // echo of the answer just given must never read as a re-ask
  // (false positive caught by the Publish #78 replay suite).
  return /\blive in\b[^.?!]{0,60}\b(flip|rent|invest)/.test(t)
    || /\b(plan|planning) to live in\b[^.?!]{0,60}\binvestment\b/.test(t)
    || /\blive in it, or is it an investment\b/.test(t)
    || /home to live in[^.?!]{0,30}\bor\b/.test(t)
    || /what (the|is your) (home|house|property) is for/.test(t);
}

/**
 * Does this model turn ASK for capture — the step-2 beat's shapes
 * (Publish #82)? The channel choice ("would you prefer an email
 * or a mobile number for the link?", "via email or text
 * message?"), a direct detail request ("may I have your name,
 * your email, and the best phone number…", "can I get your email
 * address?"), or a direct address question ("What is the best
 * email address to send that to?"). Ask shapes only: a read-back
 * confirming details already given ("your email is T-O-N-Y… Did
 * I get that right?") matches none of them, and neither does the
 * name beat on its own ("May I have your name, so I can greet you
 * properly?" — no channel word, and the name rules own it).
 * Classification is not condemnation: in non-push flow this is
 * the #72 amendment's designed step-2 ask; it becomes a gate
 * VIOLATION only when produced while the gate is owed.
 */
export function turnAsksForCapture(text: string): boolean {
  if (!text) return false;
  const t = text;
  return /\b(may|can|could) i (please )?(have|get)\b[^.?!]{0,90}\b(e-?mail|phone|mobile|number)\b/i.test(t)
    || /\bwhat('s| is) (the best|your|a good)\b[^.?!]{0,50}\b(e-?mail|phone|mobile|number)\b/i.test(t)
    || /\b(e-?mail|mobile|phone|text)\b[^.?!]{0,40}\bor\b[^.?!]{0,30}\b(e-?mail|mobile|phone|text)\b/i.test(t)
    || /\bprefer\b[^.?!]{0,60}\b(e-?mail|mobile|phone|text)\b/i.test(t);
}

// ---------------------------------------------------------------------------
// Publish #87 model-turn detectors (2026-11-22): the discovery
// questions, the no-match answer, the transfer beats and the
// step-out — the observe half of the extended ledger.
// ---------------------------------------------------------------------------

/** This model turn asks the AREAS question (Q2's shapes). */
export function turnAsksAreas(text: string): boolean {
  if (!text) return false;
  return /(which|what) areas|areas are you drawn to|(which|what) neighborhoods|areas (do|are) you (looking|drawn|interested)/i.test(text);
}

/** This model turn asks the PROPERTY TYPE question (Q3's choice). */
export function turnAsksType(text: string): boolean {
  if (!text) return false;
  return /single[- ]family[^.?!]{0,40}townhouse|townhouse[^.?!]{0,40}condo|what (type|kind) of (home|house|property|place)|a condo, a house, or|condo or (a )?house/i.test(text);
}

/** This model turn asks the BEDS/BATHS question (Q3's rider). */
export function turnAsksBedsBaths(text: string): boolean {
  if (!text) return false;
  return /how many bedrooms|how many beds|how many baths|bedrooms and baths make it work|how many bedrooms and baths/i.test(text);
}

/** This model turn asks the VIEW / SETTING question (Q4's shapes,
 * including the water-vs-golf lean). */
export function turnAsksView(text: string): boolean {
  if (!text) return false;
  return /waterfront, an ocean view|is the setting flexible|(what|which) (view|setting) are you|lean (more )?toward[^.?!]{0,70}(water|golf)|closer to the ocean or more inland/i.test(text);
}

/** This model turn delivers a NO-MATCH answer about the caller's
 * criteria (the simulation script's plain no-match shapes). */
export function turnIsNoMatchAnswer(text: string): boolean {
  if (!text) return false;
  return /don'?t have a match|do not have a match|no (current )?match for|nothing (in|on) (the|our) (current )?listings? (fits|matches)|not among [^.!?]{0,40}current listings/i.test(text);
}

/** This model turn delivers the transfer HONESTY line (the demo
 * cannot complete the transfer) — the line that may be said once. */
export function turnDeliversTransferHonesty(text: string): boolean {
  if (!text) return false;
  return /cannot complete the transfer|can'?t complete the transfer|i (cannot|can'?t) (complete|do) (the|a|that) transfer/i.test(text);
}

/** This model turn itself offers the CALLBACK capture — name and
 * number so the agent can call back: the transfer fallback,
 * delivered by the model without needing the gate's order. */
export function turnOffersCallbackCapture(text: string): boolean {
  if (!text) return false;
  return /call you back/i.test(text) && /(your name|best number|phone number|mobile number|reach you)/i.test(text);
}

/** This model turn announces the STEP-OUT of the simulation — the
 * one beat after which a fresh simulation entry is legitimate. */
export function turnStepsOutOfSimulation(text: string): boolean {
  if (!text) return false;
  return /stepping out of simulation mode|step out of simulation mode|stepping out of the simulation/i.test(text);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DiscoveryGateState {
  /** The visitor's banked name ('' = not given). First clear
   * statement wins; never overwritten by a later guess. */
  visitorName: string;
  /** Standalone name asks delivered so far (bundled capture asks
   * never count). */
  standaloneNameAsks: number;
  /** The immediately preceding model turn asked for the name —
   * the position in which a bare reply is an introduction. */
  prevTurnAskedName: boolean;
  /** Name-known corrections injected (cap 2). */
  nameKnownFires: number;
  /** Name-loop releases injected (cap 2). */
  nameReleaseFires: number;
  /** The name-held order has been delivered — pre-emptively at
   * the boundary where the name first stood held (Publish #82),
   * or by the after-the-fact name-known correction, which also
   * announces it. Set once; the pre-emptive order never repeats. */
  nameHeldAnnounced: boolean;
  /** In-role greetings delivered so far. */
  inRoleGreetings: number;
  /** The one-time re-greeting correction has been spent. */
  greetingCorrected: boolean;
  /** Purpose stated by the visitor, in their own words. */
  purposeBanked: boolean;
  /** The visitor's stated budget, in their own words ('' = none).
   * First statement wins — a restatement never widens it. */
  budgetBanked: string;
  /** Any criterion content at all (type / feature signals). */
  contentBanked: boolean;
  /** A push to skip or a read-back request is outstanding: the
   * gate is owed and has not yet validly run. */
  gateOwed: boolean;
  /** Short-gate order fires for the outstanding push (Publish
   * #80: the order PERSISTS until the gate observably runs —
   * cap 2 per push, the initial fire plus one sterner repeat. A
   * fresh push renews it: the fold resets this to 0). */
  gateOrderFires: number;
  /** The outstanding order fired on a turn that signaled the
   * simulation entry and so does not count (Publish #80, defect
   * 3): it is carried across the segment boundary and re-fires
   * at the first post-transition boundary. */
  gateOrderCarried: boolean;
  /** Consecutive transition-window turns the outstanding order
   * has been carried across (Publish #82): the entry-signal turn
   * and — while a carry is outstanding — the in-role greeting
   * turn that completes a two-turn straddle both carry; the
   * count is the sane bound's ledger (GATE_ORDER_MAX_CARRY_TURNS)
   * and resets whenever a fire counts. */
  gateOrderCarryTurns: number;
  /** Gate-violation corrections fired for the outstanding push
   * (Publish #82): a capture/channel ask produced while the gate
   * is owed earns its own correction on its own budget (cap
   * GATE_VIOLATION_MAX_FIRES per push; the fresh-push fold
   * resets it), never consuming the order's fires. */
  gateViolationFires: number;
  /** A model turn has announced the simulation entry. */
  simulationEntered: boolean;
  /** The most recent short-gate fire was a repeat (a prior fire
   * or a carried order) — the proxy picks the sterner directive
   * variant from it. Reset by every non-repeat fire. */
  shortGateRepeat: boolean;
  /** The gate question has been asked AND its recap judged
   * complete at least once. (Publish #80: asking the question
   * over an incomplete recap no longer sets this — the recap is
   * void; see recapVoided.) */
  gateAsked: boolean;
  /** The visitor stated a specific view / setting as a
   * criterion (Publish #80) — the ledger half of the recap
   * judgment's inserted-view check. */
  viewBanked: boolean;
  /** The one-time bracket correction has been spent. */
  budgetBracketCorrected: boolean;
  /** A budget-involving recap-completeness correction has
   * fired (Publish #80: set by the void mechanism, which
   * replaces the one-shot #78 budget-recap rule). */
  budgetRecapCorrected: boolean;
  /** The one-time range-collapse correction has been spent
   * (Publish #80). */
  budgetRangeCorrected: boolean;
  /** The last gate recap was judged INCOMPLETE (Publish #80):
   * it is void, the gate debt stands, and the visitor's answer
   * to it cannot discharge the gate. */
  recapVoided: boolean;
  /** What the voided recap dropped — 'budget' and/or 'purpose'
   * — named by the completeness directive. */
  recapMissing: string[];
  /** The voided recap asserted a specific view the visitor
   * never stated. */
  recapInsertedView: boolean;
  /** Completeness-correction fires for the current void
   * episode (cap 2 — the correction persists like the order). */
  recapCorrectionFires: number;
  /** Total directives injected this session. */
  fires: number;
  // ---- Publish #87 (2026-11-22): the extended ledger ----------
  /** The areas the caller named, in their own words (accumulate,
   * never shrink — the discovery layer's running-list rule). */
  areasBanked: string[];
  /** The caller answered the areas question substantively (a
   * wave-off included — answered-open, per the layer) even when
   * no place name was detected in the answer. */
  areasAnswered: boolean;
  /** The property-type answer as a short label ('' = unbanked):
   * a named type, or 'any type (open)' for the waved-off shapes. */
  typeBanked: string;
  /** Beds and/or baths stated (or answered to the question). */
  bedsBathsBanked: boolean;
  /** The previous model turn asked the areas question — the
   * position in which a substantive reply is that dimension's
   * answer (the name rule's bare-reply pattern, generalized). */
  prevTurnAskedAreas: boolean;
  prevTurnAskedType: boolean;
  prevTurnAskedBedsBaths: boolean;
  prevTurnAskedView: boolean;
  /** Dimensions whose settled-fact correction has fired (one
   * per dimension: 'areas' | 'type' | 'beds-baths' | 'view' |
   * 'purpose'). */
  reaskCorrected: string[];
  /** The dimension + evidence of the settled-fact correction
   * chosen at the most recent boundary — the proxy reads them to
   * build that boundary's directive text. */
  lastReaskDimension: string;
  lastReaskEvidence: string;
  /** The caller answered the view question substantively (a
   * "flexible" included — answered-open) without stating a
   * specific view: the question is settled even though
   * viewBanked (a SPECIFIC view, for the recap judgment) is not. */
  viewAnswered: boolean;
  /** Beds/baths as the caller's own span ("two bedroom, two
   * baths") when a counted shape stated them — the settled-fact
   * correction quotes it. */
  bedsBathsLabel: string;
  /** Model turns completed this session (the entry's lateness
   * is judged against it). */
  modelTurns: number;
  /** A step-out announcement has been observed since the entry:
   * the one state in which a new simulation entry is legitimate. */
  steppedOut: boolean;
  /** Entry re-run corrections injected (cap 2). */
  entryRerunFires: number;
  /** No-match answers delivered this session. */
  noMatchCount: number;
  /** The banked-criteria signature at the last no-match — a
   * repeat with the SAME signature banked nothing new: a loop. */
  noMatchSignature: string;
  /** The outstanding gate debt was armed by a no-match (its
   * order is the close order, not the skip order). */
  noMatchClose: boolean;
  /** Transfer demands the visitor has made this session. */
  transferDemands: number;
  /** Transfer honesty lines delivered this session. */
  transferHonestyCount: number;
  /** Transfer-fallback orders injected (cap 2). */
  transferFallbackFires: number;
  /** The callback-capture fallback has been delivered (by the
   * model itself or under the gate's order). */
  transferFallbackDone: boolean;
}

export const freshDiscoveryGateState = (): DiscoveryGateState => ({
  visitorName: '',
  standaloneNameAsks: 0,
  prevTurnAskedName: false,
  nameKnownFires: 0,
  nameReleaseFires: 0,
  nameHeldAnnounced: false,
  inRoleGreetings: 0,
  greetingCorrected: false,
  purposeBanked: false,
  budgetBanked: '',
  contentBanked: false,
  gateOwed: false,
  gateOrderFires: 0,
  gateOrderCarried: false,
  gateOrderCarryTurns: 0,
  gateViolationFires: 0,
  simulationEntered: false,
  shortGateRepeat: false,
  gateAsked: false,
  viewBanked: false,
  budgetBracketCorrected: false,
  budgetRecapCorrected: false,
  budgetRangeCorrected: false,
  recapVoided: false,
  recapMissing: [],
  recapInsertedView: false,
  recapCorrectionFires: 0,
  fires: 0,
  areasBanked: [],
  areasAnswered: false,
  typeBanked: '',
  bedsBathsBanked: false,
  prevTurnAskedAreas: false,
  prevTurnAskedType: false,
  prevTurnAskedBedsBaths: false,
  prevTurnAskedView: false,
  reaskCorrected: [],
  lastReaskDimension: '',
  lastReaskEvidence: '',
  viewAnswered: false,
  bedsBathsLabel: '',
  modelTurns: 0,
  steppedOut: false,
  entryRerunFires: 0,
  noMatchCount: 0,
  noMatchSignature: '',
  noMatchClose: false,
  transferDemands: 0,
  transferHonestyCount: 0,
  transferFallbackFires: 0,
  transferFallbackDone: false,
});

/**
 * The name a successor session may treat as banked from its seed
 * facts: the captured-contact store's name first (it is this
 * visitor's own confirmed fact), then the session's visitor
 * contact name — sanitized, so a placeholder sentinel ("CRM
 * Prospect") is NO name here either.
 */
export function seedNameFromFacts(input: {
  capturedName?: unknown;
  visitorContactName?: unknown;
}): string {
  const captured = typeof input.capturedName === 'string' ? input.capturedName.trim() : '';
  if (captured) return captured;
  return sanitizeVisitorName(input.visitorContactName);
}

/**
 * Arm the gate at a successor session's start from the recap the
 * session was authorized with (a segment's swapRecap, a
 * reconnect's recap): Visitor lines only, scanned for the same
 * facts the live fold banks — a stated name, a stated purpose, a
 * stated budget — so a fact banked in the parent session is never
 * re-asked for, re-opened or dropped by the successor. The seed
 * name (the store / visitor contact) wins over a recap
 * introduction when both exist: the store is the durable truth.
 */
export function armDiscoveryGate(
  state: DiscoveryGateState,
  input: { recapText?: string; seedName?: string },
): DiscoveryGateState {
  let out = state;
  const seed = (input.seedName || '').trim();
  if (seed && !out.visitorName) out = { ...out, visitorName: seed };
  const recap = input.recapText || '';
  if (!recap) return out;
  for (const line of recap.split('\n')) {
    if (!line.startsWith('Visitor:')) continue;
    const utterance = line.slice('Visitor:'.length);
    if (!out.visitorName) {
      const name = detectStatedName(utterance);
      if (name) out = { ...out, visitorName: name };
    }
    if (!out.purposeBanked && detectPurposeStated(utterance)) out = { ...out, purposeBanked: true };
    if (!out.viewBanked && detectStatedView(utterance)) out = { ...out, viewBanked: true };
    if (!out.budgetBanked) {
      const budget = detectStatedBudget(utterance);
      if (budget) out = { ...out, budgetBanked: budget };
    }
    if (!out.contentBanked && detectTypeOrFeature(utterance)) out = { ...out, contentBanked: true };
    // Publish #87: the extended ledger arms from the recap too —
    // a fact banked in the parent session is never re-asked for
    // by the successor.
    const areas = detectStatedAreas(utterance);
    if (areas.length) {
      const merged = [...out.areasBanked];
      for (const a of areas) if (!merged.some((x) => x.toLowerCase() === a.toLowerCase())) merged.push(a);
      out = { ...out, areasBanked: merged.slice(0, 5), areasAnswered: true };
    }
    if (!out.typeBanked) {
      const type = detectStatedType(utterance);
      if (type) out = { ...out, typeBanked: type };
    }
    if (!out.bedsBathsBanked && detectStatedBedsBaths(utterance)) {
      out = { ...out, bedsBathsBanked: true, bedsBathsLabel: detectStatedBedsBathsLabel(utterance) || out.bedsBathsLabel };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Directives (server-authored; each orders the NEXT spoken turn)
// ---------------------------------------------------------------------------

/** The recap contents the short-gate order names, from the
 * gate's own ledger: the banked items the recap must carry. */
export function bankedSummary(state: DiscoveryGateState): string {
  const parts: string[] = [];
  if (state.purposeBanked) parts.push('their purpose');
  if (state.budgetBanked) parts.push(`their stated budget — ${state.budgetBanked} — exactly as stated`);
  // Publish #87: the extended ledger names its dimensions
  // specifically; the generic content part remains only for a
  // session whose content banked without a specific dimension.
  if (state.areasBanked.length) parts.push(`their areas — ${state.areasBanked.join(', ')}`);
  else if (state.areasAnswered) parts.push('their area answer');
  if (state.typeBanked) parts.push(`their property type — ${state.typeBanked}`);
  if (state.bedsBathsBanked) parts.push('their beds and baths');
  if (state.viewBanked || state.viewAnswered) parts.push('their view / setting');
  if (state.contentBanked && !state.areasBanked.length && !state.typeBanked && !state.bedsBathsBanked && !state.viewBanked && !state.viewAnswered) {
    parts.push('the areas, property type and details they gave');
  }
  return parts.join('; ');
}

/**
 * The short-gate order (defect B): the caller pushed to skip (or
 * asked for the read-back) and the answering turn ran no gate.
 * Orders the gate — recap of the banked, gate question, wait —
 * ahead of any promise and any contact ask. The `repeat` variant
 * (Publish #80) is the sterner second firing: the order already
 * fired once and the gate STILL has not run, so whatever the
 * caller said yes to in between was not a yes to a recap.
 */
export function shortGateDirective(state: DiscoveryGateState, repeat = false): string {
  const base = `STOP — the caller asked to skip ahead, and your last turn answered with something else instead of the gate. No promise and no contact ask may come before the gate. Run the SHORT GATE now, in this order: (1) recap ONLY what the caller has banked so far — ${bankedSummary(state)} — naming anything never covered as still open, never filling it in; (2) end the recap with exactly: "Did I capture that all correctly?" and WAIT for their answer. Only after their yes to THAT recap may you promise the list in their channel — and only then make the one capture ask, if no details were ever given. A yes the caller gave to anything else was not a yes to a recap they never heard.`;
  if (!repeat) return base;
  return `${base} This order has already been given once and the recap-and-confirm step STILL has not happened. A "yes" the caller said since then was an answer to something else — it was not a confirmation of a recap, and it was not a refusal of anything. Do not treat it as either. Run the gate now.`;
}

/**
 * The nothing-banked skip order (defect B, second shape): the
 * caller pushed to skip before banking anything at all. The one
 * missing keystone is purpose — asked once, briefly — and a
 * contact ask at this moment is barred outright. The `repeat`
 * variant (Publish #80) is the sterner re-firing — including the
 * order carried across the simulation-entry boundary, whose
 * first firing the transition consumed.
 */
export function shortGatePurposeDirective(repeat = false): string {
  const base = `STOP — the caller wants to skip ahead, but they have not yet given you the one keystone: what the home is FOR. Do NOT ask for contact details and do not promise anything. Ask the PURPOSE choice once, briefly — a home to live in, one to fix up and flip, or a long-term hold to rent out — with its why-line: "The same condo is a different search for each." When they answer, run the short gate on what is then banked: recap it, end with "Did I capture that all correctly?", take their yes — and only then the promise, and the one capture ask if no details were ever given.`;
  if (!repeat) return base;
  return `${base} This order has already been given once and the purpose question STILL has not been asked. Ask it now, before anything else — it is the one move this conversation is waiting on.`;
}

/**
 * The gate-violation correction (Publish #82, defect 1): the
 * caller pushed to skip, the gate is owed, and the answering
 * turn produced the step-2 capture/channel ask anyway. The
 * step-2 beat is PRE-EMPTED while the gate is owed — the ask
 * does not count, and details surrendered to it do not discharge
 * the gate. (In non-push flow the same ask is the approved
 * step-2 design and is never corrected; this directive exists
 * only inside an armed gate debt.)
 */
export function gateViolationDirective(state: DiscoveryGateState): string {
  return `STOP — the caller asked to skip ahead, and your last turn answered with the capture ask — the email-or-mobile channel question, the step-2 beat. While the gate is owed, that beat is PRE-EMPTED: the ask you just made does not count, it does not advance the capture, and any details the caller gives in answer to it do NOT discharge the gate — the recap still runs first. No promise and no contact ask may come before the gate. Run the SHORT GATE now, in this order: (1) recap ONLY what the caller has banked so far — ${bankedSummary(state)} — naming anything never covered as still open, never filling it in; (2) end the recap with exactly: "Did I capture that all correctly?" and WAIT for their answer. Only after their yes to THAT recap may you promise the list in their channel — and only then make the one capture ask, if no details were ever given.`;
}

/**
 * The name-known correction (defects A + D): the model asked for
 * a name the session already holds. States the name as held and
 * orders the conversation — not the ask — to continue.
 */
export function nameKnownDirective(name: string): string {
  return `STOP — you just asked for the visitor's name, but you already have it: their name is ${name}. A name you hold is never re-asked — not in the greeting form, not in the "greet you properly" form, not at any later beat. Use their name naturally and continue the conversation NOW from what the visitor last said: answer what they actually told you and carry the discovery forward. Do not restart any part of the conversation and do not apologize at length.`;
}

/**
 * The PRE-EMPTIVE name-held order (Publish #82, defect 3):
 * delivered at the boundary where a name first stands held —
 * seeded at the session's start, or banked from the visitor's
 * own doorway answer — BEFORE the script's later name beat can
 * fire. The beat is declared satisfied in advance; the
 * after-the-fact correction above remains the second line for a
 * model that asks anyway.
 */
export function namePreemptDirective(name: string): string {
  return `You already have the visitor's name: ${name} — it was given at the doorway, or before this session, and it is settled. Your script's later name beat ("May I have your name, so I can greet you properly?") is ALREADY SATISFIED: do not produce that ask in any form, at any later beat — a name you hold is never asked for. Use their name naturally and carry on with the conversation.`;
}

/**
 * The name-loop release (defect D): the name has been asked
 * standalone twice and not given. The question is closed; the
 * conversation proceeds without a name. The second firing is the
 * sterner repeat, for a model that asked a third time anyway.
 */
export function nameReleaseDirective(second: boolean): string {
  if (second) {
    return `You asked for the visitor's name AGAIN after being told the question is closed. It stays closed: no name ask of any form for the rest of this session. Take up what the visitor just told you and run the discovery — their criteria are the conversation now.`;
  }
  return `The visitor has now been asked for their name twice and has not given it — they are answering with what they need instead. The name is OPTIONAL, and the question is now CLOSED for this session: do not ask for their name again in any form (not the greeting form, not the "greet you properly" form, not as a standalone question). Proceed WITHOUT a name: take up what the visitor just told you — bank it — and run the discovery arc exactly as if the name step were complete. (The close's single capture ask for contact details is a different beat and is untouched by this.)`;
}

/**
 * The stated-budget bracket correction (defect D's companion —
 * the #69 rule, mechanically): the bracket offer after a stated
 * budget tells the caller he was not heard.
 */
export function budgetBracketDirective(budget: string): string {
  return `STOP — the caller already stated their budget: ${budget}. It is BANKED, and the money question is closed. Never offer the bracket question ("up to about five hundred, or closer to a million?") or any wider range after a stated budget. Continue the conversation from what the caller just said, and when the recap comes, the budget goes into it exactly as stated.`;
}

/**
 * The budget-recap correction (defect D): the gate ran on a recap
 * that dropped the banked budget. A recap that drops a banked
 * criterion is a failed recap; the gate re-runs complete before
 * the promise may rest on it.
 */
export function budgetRecapDirective(budget: string): string {
  return `STOP — your recap just left out the caller's stated budget: ${budget}. A recap that drops a banked criterion is a failed recap, and the promise may not rest on it. Run the recap again NOW, complete — every banked criterion, the budget included exactly as stated — and end with "Did I capture that all correctly?" and wait for a fresh answer. The gate question you just asked does not count.`;
}

/**
 * The range-collapse correction (Publish #80, defect D's other
 * half): an acknowledgment repeated a stated RANGE as its top
 * end alone. A stated range is repeated as a range, exactly as
 * given, every time it comes up.
 */
export function budgetRangeDirective(budget: string): string {
  return `STOP — the caller stated their budget as a range: ${budget}. Your last turn repeated it as a single figure — one end of the range — which is not what they said. A stated range is repeated AS the range, exactly as given, every time it comes up: ${budget}. Correct it naturally as you continue, and when the recap comes, the budget goes into it as the full range.`;
}

/**
 * The recap-completeness correction (Publish #80, defect D's
 * mechanism): the gate recap was judged VOID on its own turn —
 * it dropped banked criteria (named here from the ledger) and/or
 * asserted a view the caller never stated. The recap does not
 * count, its answer does not count, and the complete recap is
 * delivered instead. (When the budget is among the missing, the
 * decision fires the budget-recap kind and its directive above;
 * this builder serves the remaining shapes.)
 */
export function recapCompletenessDirective(state: DiscoveryGateState): string {
  const missing: string[] = [];
  if (state.recapMissing.includes('budget')) {
    missing.push(state.budgetBanked
      ? `their stated budget — ${state.budgetBanked} — exactly as the range they gave it, never collapsed to one end of it`
      : 'their stated budget');
  }
  if (state.recapMissing.includes('purpose')) {
    missing.push('what the home is for — their purpose');
  }
  const dropped = missing.length ? ` it left out ${missing.join(' and ')}.` : '';
  let text = `STOP — the recap you just ran does NOT count:${dropped} The gate has not validly run, any answer the caller gives to that recap does not count, and the list promise is still blocked. Run the recap again NOW, complete — every criterion the caller has banked, nothing dropped — and end with exactly: "Did I capture that all correctly?" and wait for a fresh answer. Do not ask for contact details and do not promise to send anything until the caller confirms the COMPLETE recap.`;
  if (state.recapInsertedView) {
    text += ` One more thing: your recap also stated a specific view as the caller's criterion — they never chose one. Never present a view or setting as chosen unless the caller stated it; name it as still open instead.`;
  }
  return text;
}

/**
 * The greeting-once correction (defect A): a second in-role
 * greeting has been delivered. The count is the enforcement the
 * step-0 prose rule never had.
 */
export function greetingOnceDirective(): string {
  return `You have already greeted this caller in role once in this session — the turn that just completed greeted them again. The greeting happens ONCE: never greet again in this session — no new time-of-day greeting, no fresh "thank you for calling". Continue from what the caller last said: answer it and carry the conversation forward.`;
}

/**
 * The entry re-run correction (Publish #87, defect 1): a model
 * turn signaled the simulation entry on a session that already
 * entered — or entered LATE, after discovery was underway (the
 * displaced-entry case: the session opened as a resume, the
 * entry never ran at the start, and a fragment turn shook it
 * loose mid-conversation). The entry is once-per-visit; the
 * correction names the settled state so the model resumes the
 * conversation it is actually in.
 */
export function entryRerunDirective(state: DiscoveryGateState): string {
  const banked = bankedSummary(state);
  return `STOP — your last turn re-ran the simulation entry: the name ask, the "stepping into simulation mode" announcement, the framing, the in-role greeting. The entry runs ONCE, at the start of the visit — this conversation is already underway, and everything in it stands${banked ? `: ${banked}` : ''}. Never re-run any part of the entry again in this visit. Apologize ONCE, briefly, for the repetition, then pick the conversation up from the caller's last substantive answer and continue helping them — do not restart any question sequence and do not ask for anything they have already given you.`;
}

/**
 * The settled-fact correction (Publish #87, defect 4): the model
 * asked about a dimension the ledger holds as answered. Names
 * the dimension and the caller's own answer — the correction is
 * the memory the model dropped.
 */
export function settledReaskDirective(dimensionLabel: string, evidence: string): string {
  return `STOP — you just asked about ${dimensionLabel} again, but the caller already answered it: ${evidence}. A settled fact is never re-asked — asking again tells the caller you were not listening. Do not ask it in another form and do not apologize at length. Continue from their answer: ask the next thing they have NOT answered yet — or, if their criteria are complete, run the close: recap everything banked, end with "Did I capture that all correctly?", and on their yes make the promise and the one capture ask.`;
}

/**
 * The no-match close order (Publish #87, defect 6): a no-match
 * landed with the core criteria complete — or repeated with
 * nothing new banked since the last one. The designed value path
 * replaces the loop: recap + gate, the promise (the agent pulls
 * and SENDS the list), and the one capture ask that makes the
 * send possible.
 */
export function noMatchCloseDirective(state: DiscoveryGateState): string {
  return `STOP — that search came back with no match, and the caller's criteria on your ledger are: ${bankedSummary(state)}. The qualification loop ENDS here: do not deliver another no-match, and do not ask any discovery question that is already answered. Run the CLOSE now, in this order: (1) recap their criteria in one breath — everything banked, anything never covered named as still open — and end with exactly: "Did I capture that all correctly?" and WAIT for their answer; (2) on their yes, make the promise: the agent will pull the broader-market matches and SEND them the list in their channel; (3) if you do not already hold their contact details, make the ONE capture ask — their name, and an email or mobile number — so the list can actually reach them, and run the verbal capture confirmation on whatever they dictate. The list is the deliverable: never swap the promise for a callback, and never let a no-match be the last word on the search.`;
}

/**
 * The transfer-fallback order (Publish #87, defect 7): the
 * caller has demanded a transfer a SECOND time and the honesty
 * line has already been given once. The demand converts to the
 * callback capture, and the target is named — the pack's agent,
 * supplied by the proxy — so it can never mutate between asks.
 */
export function transferFallbackDirective(agentName: string): string {
  const target = agentName || 'the agent';
  return `STOP — the caller has now demanded a transfer for the SECOND time in this conversation, and the transfer honesty line has already been given once. Do NOT repeat it, do not recap, and do not say goodbye. Convert to the fallback NOW: apologize once, briefly, and offer the callback — "Let me take your name and the best number to reach you, and ${target} will call you back" — then take their name and number, and run the verbal capture confirmation on the number. The transfer target is ${target} — the same name on every transfer beat of this conversation, never a different title or person.`;
}

// ---------------------------------------------------------------------------
// The turn-boundary decision
// ---------------------------------------------------------------------------

export type DiscoveryGateInjection =
  | 'short-gate'
  | 'short-gate-purpose'
  | 'short-gate-violation'
  | 'no-match-close'
  | 'entry-rerun'
  | 'transfer-fallback'
  | 'settled-reask'
  | 'name-known'
  | 'name-known-preempt'
  | 'name-release'
  | 'budget-bracket'
  | 'budget-recap'
  | 'budget-range'
  | 'recap-completeness'
  | 'greeting-once'
  | null;

/**
 * The turn-boundary decision, evaluated by the proxy at each model
 * turnComplete on presenter realtor sessions — the same call
 * pattern as captureGateTurnDecision. The visitor's completed
 * utterance is folded in FIRST (banking is judged on everything
 * the visitor has said, including the utterance this turn
 * answered), the model turn is then observed, and at most one
 * directive is chosen, in the priority order the header lays out.
 * `blocked` (a preview, a farewell that owns the close, a
 * connecting transfer, an on-screen card — or a boundary where the
 * capture gate or the consent ask already injected) suppresses
 * every injection while the fold and the observations still land,
 * so the state is judged fresh at the first unblocked boundary.
 */
export function discoveryGateTurnDecision(input: {
  state: DiscoveryGateState;
  visitorUtterance: string;
  modelTurnText: string;
  blocked: boolean;
}): { state: DiscoveryGateState; inject: DiscoveryGateInjection } {
  const { visitorUtterance, modelTurnText, blocked } = input;
  let state = input.state;

  // ---- FOLD the visitor's completed utterance -------------------------
  if (visitorUtterance) {
    if (!state.visitorName) {
      const stated = detectStatedName(visitorUtterance);
      const bare = !stated && state.prevTurnAskedName ? bareReplyName(visitorUtterance) : '';
      const name = stated || bare;
      if (name) state = { ...state, visitorName: name };
    }
    if (!state.purposeBanked && detectPurposeStated(visitorUtterance)) {
      state = { ...state, purposeBanked: true };
    }
    if (!state.budgetBanked) {
      const budget = detectStatedBudget(visitorUtterance);
      if (budget) state = { ...state, budgetBanked: budget };
    }
    if (!state.viewBanked && detectStatedView(visitorUtterance)) {
      state = { ...state, viewBanked: true };
    }
    if (!state.contentBanked && detectTypeOrFeature(visitorUtterance)) {
      state = { ...state, contentBanked: true };
    }
    // Publish #87 — the extended ledger folds: areas (named
    // places accumulate, never shrink), property type, beds/
    // baths — plus the ANSWERED-AFTER-ASK rule: a substantive
    // reply to a dimension's own question banks that dimension
    // even when no detector shape matches the reply (a wave-off
    // banks as answered-open, per the discovery layer). A reply
    // that is itself a question, or a transfer demand, banks
    // nothing — it changed the subject, it did not answer.
    const areas = detectStatedAreas(visitorUtterance);
    if (areas.length) {
      const merged = [...state.areasBanked];
      for (const a of areas) if (!merged.some((x) => x.toLowerCase() === a.toLowerCase())) merged.push(a);
      state = { ...state, areasBanked: merged.slice(0, 5), areasAnswered: true };
    }
    if (!state.typeBanked) {
      const type = detectStatedType(visitorUtterance);
      if (type) state = { ...state, typeBanked: type };
    }
    if (!state.bedsBathsBanked && detectStatedBedsBaths(visitorUtterance)) {
      state = { ...state, bedsBathsBanked: true, bedsBathsLabel: detectStatedBedsBathsLabel(visitorUtterance) || state.bedsBathsLabel };
    }
    const replyWords = visitorUtterance.replace(/[^A-Za-z'’\s-]/g, ' ').split(/\s+/).filter(Boolean);
    const substantiveReply = replyWords.length >= 2
      && !detectTransferDemand(visitorUtterance)
      && !(visitorUtterance.includes('?') && replyWords.length >= 4);
    if (substantiveReply) {
      if (state.prevTurnAskedAreas && !state.areasAnswered) state = { ...state, areasAnswered: true };
      if (state.prevTurnAskedType && !state.typeBanked) state = { ...state, typeBanked: 'their stated choice' };
      if (state.prevTurnAskedBedsBaths && !state.bedsBathsBanked) state = { ...state, bedsBathsBanked: true };
      if (state.prevTurnAskedView && !state.viewAnswered) state = { ...state, viewAnswered: true };
    }
    if (detectTransferDemand(visitorUtterance)) {
      state = { ...state, transferDemands: state.transferDemands + 1 };
    }
    if (detectPushToSkip(visitorUtterance) || detectRecapAsk(visitorUtterance)) {
      // A push makes the gate owed — and a REPEATED push renews
      // the order even while the gate is still owed from the
      // first one: the caller is insisting, and the order the
      // first push bought has already been spent unanswered.
      // Publish #82: the violation budget and the carry ledger
      // are per-episode too — a fresh push renews them all.
      state = { ...state, gateOwed: true, gateOrderFires: 0, gateOrderCarried: false, gateOrderCarryTurns: 0, gateViolationFires: 0, shortGateRepeat: false, noMatchClose: false };
    }
  }

  // ---- OBSERVE the model turn that just completed ---------------------
  const askedName = turnAsksForName(modelTurnText);
  const askedNameStandalone = askedName && turnAsksForNameStandalone(modelTurnText);
  if (askedNameStandalone) {
    state = { ...state, standaloneNameAsks: state.standaloneNameAsks + 1 };
  }
  const greeted = turnIsInRoleGreeting(modelTurnText);
  if (greeted) state = { ...state, inRoleGreetings: state.inRoleGreetings + 1 };
  // Publish #87: the entry's state BEFORE this turn — the re-run
  // judgment compares the turn's entry signal against it. A
  // step-out announcement closes the simulation (a later entry
  // is the legitimate return); an entry signal (re-)opens it.
  const entrySignal = turnSignalsSimulationEntry(modelTurnText);
  const wasEntered = state.simulationEntered;
  state = { ...state, modelTurns: state.modelTurns + 1 };
  if (turnStepsOutOfSimulation(modelTurnText)) {
    state = { ...state, steppedOut: true, simulationEntered: false };
  } else if (entrySignal) {
    state = { ...state, simulationEntered: true, steppedOut: false };
  }
  const gateRan = turnAsksGateQuestion(modelTurnText);
  if (gateRan) {
    // Publish #80 — THE RECAP IS JUDGED ON ITS OWN TURN. #78 set
    // gateAsked and cleared the debt on the question alone, so a
    // recap that dropped a banked criterion still "ran the gate"
    // and the visitor's yes was accepted on it. Now the recap
    // must CARRY the ledger: every banked headline criterion
    // present (the budget in full — a range carried as a range),
    // and no specific view asserted that the visitor never
    // stated. Complete discharges the debt; anything else is a
    // VOID recap — the debt stands and the answer cannot count.
    const missing: string[] = [];
    if (state.budgetBanked && !budgetFullyMentionedInTurn(modelTurnText, state.budgetBanked)) {
      missing.push('budget');
    }
    if (state.purposeBanked && !turnMentionsPurpose(modelTurnText)) {
      missing.push('purpose');
    }
    const insertedView = !state.viewBanked && turnAssertsSpecificView(modelTurnText);
    if (missing.length === 0 && !insertedView) {
      state = {
        ...state,
        gateAsked: true,
        gateOwed: false,
        gateOrderFires: 0,
        gateOrderCarried: false,
        gateOrderCarryTurns: 0,
        gateViolationFires: 0,
        recapVoided: false,
        recapMissing: [],
        recapInsertedView: false,
        recapCorrectionFires: 0,
        noMatchClose: false,
      };
    } else {
      state = {
        ...state,
        gateOwed: true,
        recapVoided: true,
        recapMissing: missing,
        recapInsertedView: insertedView,
      };
    }
  }
  const offeredBracket = turnOffersBracket(modelTurnText);
  // Publish #82: is this turn a capture/channel ask (the step-2
  // beat's shapes)? Judged here so the decision below can tell a
  // gate VIOLATION — that ask produced while the gate is owed —
  // from ordinary non-compliance.
  const captureAsk = turnAsksForCapture(modelTurnText);
  state = { ...state, prevTurnAskedName: askedName };

  // Publish #87 — observe the extended ledger's model half: the
  // discovery questions this turn asked (the next boundary's
  // fold banks a substantive reply as that dimension's answer),
  // the no-match answer (its close trigger), and the transfer
  // beats (the honesty line's count, the fallback delivered).
  const askedAreas = turnAsksAreas(modelTurnText);
  const askedType = turnAsksType(modelTurnText);
  const askedBedsBaths = turnAsksBedsBaths(modelTurnText);
  const askedView = turnAsksView(modelTurnText);
  const askedPurposeChoice = turnAsksPurposeChoice(modelTurnText);
  state = {
    ...state,
    prevTurnAskedAreas: askedAreas,
    prevTurnAskedType: askedType,
    prevTurnAskedBedsBaths: askedBedsBaths,
    prevTurnAskedView: askedView,
  };
  const bankedSignature = [
    state.purposeBanked ? 'p' : '', state.budgetBanked ? 'b' : '',
    state.areasBanked.length || state.areasAnswered ? 'a' : '', state.typeBanked ? 't' : '',
    state.bedsBathsBanked ? 's' : '', state.viewBanked || state.viewAnswered ? 'v' : '',
  ].join('|');
  if (turnIsNoMatchAnswer(modelTurnText)) {
    // THE NO-MATCH CLOSE TRIGGER: the core criteria complete
    // (purpose + budget + area + type — the discovery layer's
    // core four) means the search that just failed WAS the
    // caller's search, fully specified: the close is owed. Or
    // the same no-match repeated with NOTHING new banked since
    // the last one — a loop, whatever is still open (the close
    // then runs in its short form: banked recap, open named
    // open). Either arms the gate debt with the no-match flag;
    // the gate family below fires the close order.
    const coreComplete = state.purposeBanked && state.budgetBanked !== ''
      && (state.areasBanked.length > 0 || state.areasAnswered) && state.typeBanked !== '';
    const repeatLoop = state.noMatchCount >= 1 && state.noMatchSignature === bankedSignature;
    state = { ...state, noMatchCount: state.noMatchCount + 1, noMatchSignature: bankedSignature };
    if ((coreComplete || repeatLoop) && !state.gateAsked) {
      state = {
        ...state,
        gateOwed: true, noMatchClose: true,
        gateOrderFires: 0, gateOrderCarried: false, gateOrderCarryTurns: 0,
        gateViolationFires: 0, shortGateRepeat: false,
      };
    }
  }
  if (turnDeliversTransferHonesty(modelTurnText)) {
    state = { ...state, transferHonestyCount: state.transferHonestyCount + 1 };
  }
  if (state.transferDemands >= 1 && turnOffersCallbackCapture(modelTurnText)) {
    state = { ...state, transferFallbackDone: true };
  }

  if (blocked) return { state, inject: null };
  if (state.fires >= DISCOVERY_GATE_MAX_FIRES) return { state, inject: null };

  const anythingBanked = state.purposeBanked || state.budgetBanked !== '' || state.contentBanked;

  // 0. THE ENTRY RUNS ONCE (Publish #87, defect 1): an entry
  //    signal on an already-entered session is a re-run; so is a
  //    FIRST entry signal arriving late — several turns in, with
  //    criteria already banked (the displaced entry: the session
  //    opened as a resume, the entry never ran at the start, and
  //    a fragment turn shook it loose mid-conversation). A
  //    step-out re-arms the one legitimate re-entry, and the
  //    scripted entry (turns 1–2, nothing banked) never matches.
  const lateEntry = entrySignal && !wasEntered && !state.steppedOut && state.modelTurns >= 3
    && (state.purposeBanked || state.budgetBanked !== '' || state.contentBanked || state.areasBanked.length > 0);
  const reEntry = entrySignal && wasEntered && !state.steppedOut;
  if ((lateEntry || reEntry) && state.entryRerunFires < 2) {
    return {
      state: { ...state, entryRerunFires: state.entryRerunFires + 1, fires: state.fires + 1 },
      inject: 'entry-rerun',
    };
  }
  // 0b. THE SECOND TRANSFER DEMAND CONVERTS TO THE FALLBACK
  //     (Publish #87, defect 7): the demand is counted from the
  //     visitor's own words; the honesty line may be given once,
  //     and a second demand is never answered with it again. The
  //     order persists (cap 2) until the model's own turn offers
  //     the callback capture, which the observe step records as
  //     the fallback delivered.
  if (state.transferDemands >= 2 && !state.transferFallbackDone && state.transferFallbackFires < 2) {
    return {
      state: { ...state, transferFallbackFires: state.transferFallbackFires + 1, fires: state.fires + 1 },
      inject: 'transfer-fallback',
    };
  }
  // 1. THE GATE FAMILY — while the gate is owed and has not
  //    validly run, its orders persist until observably complied
  //    with (Publish #80: the one-shot #78 order is what stranded
  //    the debt in checks B and D).
  if (state.gateOwed && !state.gateAsked) {
    // 1a. A VOID RECAP's completeness correction — it outranks
    //     the generic order because it names what was dropped,
    //     and it re-fires once while the void stands, so a
    //     confirm that arrives against the void recap meets the
    //     correction instead of discharging the gate.
    if (state.recapVoided && state.recapCorrectionFires < 2) {
      const budgetKind = state.recapMissing.includes('budget');
      return {
        state: {
          ...state,
          recapCorrectionFires: state.recapCorrectionFires + 1,
          budgetRecapCorrected: state.budgetRecapCorrected || budgetKind,
          fires: state.fires + 1,
        },
        inject: budgetKind ? 'budget-recap' : 'recap-completeness',
      };
    }
    // 1a2. THE GATE VIOLATION (Publish #82, defect 1): with
    //      criteria banked and the gate owed, the answering turn
    //      produced the step-2 capture/channel ask — the one beat
    //      the gate exists to pre-empt at a push. It earns the
    //      violation correction immediately, on its OWN budget:
    //      pre-#82 the violating turns were indistinguishable
    //      from any other miss and consumed the order's two fires
    //      between them, after which the gate could never fire
    //      again for that push. Now the violation spends only
    //      itself, and the order below persists — at full budget
    //      — until a recap+gate turn actually occurs. (Nothing
    //      banked: the capture ask is barred by the keystone
    //      order's own text, and 1c handles it — the violation is
    //      scoped to the banked push, as tasked.)
    if (anythingBanked && captureAsk && state.gateViolationFires < GATE_VIOLATION_MAX_FIRES) {
      return {
        state: {
          ...state,
          gateViolationFires: state.gateViolationFires + 1,
          fires: state.fires + 1,
        },
        inject: 'short-gate-violation',
      };
    }
    // 1b. THE KEYSTONE DELIVERED: nothing banked, the gate owed,
    //     and the model's own turn asked the purpose question —
    //     the owed move happened. No injection; the order counts
    //     as delivered and any carry clears.
    if (!anythingBanked && !gateRan && turnAsksPurposeQuestion(modelTurnText)) {
      state = {
        ...state,
        gateOrderFires: Math.max(state.gateOrderFires, 1),
        gateOrderCarried: false,
        gateOrderCarryTurns: 0,
      };
    } else if (!gateRan && state.gateOrderFires < 2) {
      // 1c. THE SHORT-GATE ORDER — fires at every boundary where
      //     the gate is still owed and unrun, up to twice per
      //     push: the initial fire and one sterner repeat. An
      //     answering turn inside the TRANSITION WINDOW cannot
      //     obey an in-role order, so that fire is CARRIED, not
      //     counted (defect 3): it re-fires at the first
      //     post-transition boundary. Publish #82: the window is
      //     the entry-signal turn AND — while a carry is
      //     outstanding — the in-role greeting turn that completes
      //     a two-turn straddle; the carry is bounded by
      //     GATE_ORDER_MAX_CARRY_TURNS consecutive carried turns.
      //     A violation correction already given for this push
      //     also makes the next order the sterner repeat: it WAS
      //     given once, in the violation's own words.
      const repeat = state.gateOrderFires >= 1 || state.gateOrderCarried || state.gateViolationFires >= 1;
      const enteredSignal = turnSignalsSimulationEntry(modelTurnText);
      const greetingCarry = state.gateOrderCarried && turnIsInRoleGreeting(modelTurnText);
      const carriedFire = (enteredSignal || greetingCarry) && state.gateOrderCarryTurns < GATE_ORDER_MAX_CARRY_TURNS;
      return {
        state: {
          ...state,
          gateOrderFires: carriedFire ? state.gateOrderFires : state.gateOrderFires + 1,
          gateOrderCarried: carriedFire,
          gateOrderCarryTurns: carriedFire ? state.gateOrderCarryTurns + 1 : 0,
          shortGateRepeat: repeat,
          fires: state.fires + 1,
        },
        inject: anythingBanked ? (state.noMatchClose ? 'no-match-close' : 'short-gate') : 'short-gate-purpose',
      };
    }
  }
  // 2. A BANKED NAME IS NEVER RE-ASKED.
  if (state.visitorName && askedName && state.nameKnownFires < 2) {
    return {
      state: { ...state, nameKnownFires: state.nameKnownFires + 1, nameHeldAnnounced: true, fires: state.fires + 1 },
      inject: 'name-known',
    };
  }
  // 2b. THE NAME-HELD ORDER, PRE-EMPTIVE (Publish #82, defect
  //     3): a name stands held — seeded at arming or banked from
  //     the visitor's own words — and no turn has asked for it
  //     yet. Announce it as held NOW, at this boundary, before
  //     the script's later name beat can fire: prevention, where
  //     rule 2 is the cure. Once only — the flag is also set by
  //     rule 2, so a session hears the name is held exactly once
  //     before any re-ask, and any re-ask after that meets
  //     rule 2 instead.
  if (state.visitorName && !state.nameHeldAnnounced && !askedName) {
    return {
      state: { ...state, nameHeldAnnounced: true, fires: state.fires + 1 },
      inject: 'name-known-preempt',
    };
  }
  // 2c. A SETTLED FACT IS NEVER RE-ASKED (Publish #87, defect
  //     4): the model asked about a dimension the ledger holds
  //     as answered — areas, property type, beds/baths, view or
  //     the purpose choice. One correction per dimension, naming
  //     the caller's own answer as the evidence.
  const reask = !state.reaskCorrected.includes('areas') && askedAreas && (state.areasBanked.length > 0 || state.areasAnswered)
    ? {
      dimension: 'areas', label: 'the areas they are looking in',
      evidence: state.areasBanked.length ? `they named ${state.areasBanked.join(' and ')} — already on the running list` : 'they already answered the areas question — the answer stands',
    }
    : !state.reaskCorrected.includes('type') && askedType && state.typeBanked !== ''
      ? { dimension: 'type', label: 'the property type', evidence: `their answer stands — ${state.typeBanked}` }
      : !state.reaskCorrected.includes('beds-baths') && askedBedsBaths && state.bedsBathsBanked
        ? {
          dimension: 'beds-baths', label: 'the bedrooms and baths',
          evidence: state.bedsBathsLabel ? `they said ${state.bedsBathsLabel}` : 'they already gave their beds and baths',
        }
        : !state.reaskCorrected.includes('view') && askedView && (state.viewBanked || state.viewAnswered)
          ? {
            dimension: 'view', label: 'the view / setting',
            evidence: state.viewBanked ? 'they already stated the view they want' : 'they already answered the view question — the answer stands',
          }
          : !state.reaskCorrected.includes('purpose') && askedPurposeChoice && state.purposeBanked
            ? { dimension: 'purpose', label: 'what the home is for', evidence: 'they already told you what the home is for' }
            : null;
  if (reask) {
    return {
      state: {
        ...state,
        reaskCorrected: [...state.reaskCorrected, reask.dimension],
        lastReaskDimension: reask.label,
        lastReaskEvidence: reask.evidence,
        fires: state.fires + 1,
      },
      inject: 'settled-reask',
    };
  }
  // 3. THE NAME LOOP RELEASE — asked standalone for the second time
  //    (count includes this turn) with no name given; a third ask
  //    earns the one sterner repeat.
  if (!state.visitorName && askedNameStandalone && state.standaloneNameAsks >= 2 && state.nameReleaseFires < 2) {
    return {
      state: { ...state, nameReleaseFires: state.nameReleaseFires + 1, fires: state.fires + 1 },
      inject: 'name-release',
    };
  }
  // 4a. A STATED RANGE IS REPEATED AS A RANGE (Publish #80): an
  //     acknowledgment that collapses the range to its top end
  //     earns the one-time correction.
  if (state.budgetBanked && !state.budgetRangeCorrected
    && budgetRangeCollapsedInTurn(modelTurnText, state.budgetBanked)) {
    return {
      state: { ...state, budgetRangeCorrected: true, fires: state.fires + 1 },
      inject: 'budget-range',
    };
  }
  // 4b. A STATED BUDGET IS NEVER RE-OPENED by the bracket offer.
  if (state.budgetBanked && offeredBracket && !state.budgetBracketCorrected) {
    return {
      state: { ...state, budgetBracketCorrected: true, fires: state.fires + 1 },
      inject: 'budget-bracket',
    };
  }
  // (The #78 rule 4b — the one-shot budget-recap correction — is
  // gone: Publish #80's void judgment in the observe step above
  // and rule 1a replace it. A recap that drops the budget is now
  // void BEFORE its answer is accepted, and the correction
  // persists until a complete recap runs.)
  // 5. THE GREETING HAPPENS ONCE.
  if (greeted && state.inRoleGreetings >= 2 && !state.greetingCorrected) {
    return {
      state: { ...state, greetingCorrected: true, fires: state.fires + 1 },
      inject: 'greeting-once',
    };
  }
  return { state, inject: null };
}
