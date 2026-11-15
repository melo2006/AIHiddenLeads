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

import { sanitizeVisitorName } from './voice-config.ts';

/** Total discovery-gate directives one session will inject. */
export const DISCOVERY_GATE_MAX_FIRES = 6;

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
 * the discovery layer names as banking purpose). */
export function detectPurposeStated(text: string): boolean {
  if (!text) return false;
  return /\b(to live in|live in it|for (myself|ourselves|my family|us)|primary (home|residence)|move in|relocat|flip|rent (it )?out|landlord|investment|invest(ing|or)?|second home|vacation home|retire|downsiz|upsiz)/i.test(text);
}

/** Property type / feature signals — the content half of "anything
 * banked at all" for the skip decision. */
export function detectTypeOrFeature(text: string): boolean {
  if (!text) return false;
  return /\b(single-family|townhouse|townhome|condo|house|duplex|bedroom|beds?|baths?|garage|waterfront|ocean view|golf view|pool|yard|acre|beach)\b/i.test(text);
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
   * gate is owed and has not yet run. */
  gateOwed: boolean;
  /** The short-gate order has fired for the outstanding push.
   * A fresh push renews it (the fold resets this), so the order
   * fires at most once per push, never once per session. */
  gateOrderFired: boolean;
  /** The gate question has been asked at least once. */
  gateAsked: boolean;
  /** The one-time bracket correction has been spent. */
  budgetBracketCorrected: boolean;
  /** The one-time budget-recap correction has been spent. */
  budgetRecapCorrected: boolean;
  /** Total directives injected this session. */
  fires: number;
}

export const freshDiscoveryGateState = (): DiscoveryGateState => ({
  visitorName: '',
  standaloneNameAsks: 0,
  prevTurnAskedName: false,
  nameKnownFires: 0,
  nameReleaseFires: 0,
  inRoleGreetings: 0,
  greetingCorrected: false,
  purposeBanked: false,
  budgetBanked: '',
  contentBanked: false,
  gateOwed: false,
  gateOrderFired: false,
  gateAsked: false,
  budgetBracketCorrected: false,
  budgetRecapCorrected: false,
  fires: 0,
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
    if (!out.budgetBanked) {
      const budget = detectStatedBudget(utterance);
      if (budget) out = { ...out, budgetBanked: budget };
    }
    if (!out.contentBanked && detectTypeOrFeature(utterance)) out = { ...out, contentBanked: true };
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
  if (state.contentBanked) parts.push('the areas, property type and details they gave');
  return parts.join('; ');
}

/**
 * The short-gate order (defect B): the caller pushed to skip (or
 * asked for the read-back) and the answering turn ran no gate.
 * Orders the gate — recap of the banked, gate question, wait —
 * ahead of any promise and any contact ask.
 */
export function shortGateDirective(state: DiscoveryGateState): string {
  return `STOP — the caller asked to skip ahead, and your last turn answered with something else instead of the gate. No promise and no contact ask may come before the gate. Run the SHORT GATE now, in this order: (1) recap ONLY what the caller has banked so far — ${bankedSummary(state)} — naming anything never covered as still open, never filling it in; (2) end the recap with exactly: "Did I capture that all correctly?" and WAIT for their answer. Only after their yes to THAT recap may you promise the list in their channel — and only then make the one capture ask, if no details were ever given. A yes the caller gave to anything else was not a yes to a recap they never heard.`;
}

/**
 * The nothing-banked skip order (defect B, second shape): the
 * caller pushed to skip before banking anything at all. The one
 * missing keystone is purpose — asked once, briefly — and a
 * contact ask at this moment is barred outright.
 */
export function shortGatePurposeDirective(): string {
  return `STOP — the caller wants to skip ahead, but they have not yet given you the one keystone: what the home is FOR. Do NOT ask for contact details and do not promise anything. Ask the PURPOSE choice once, briefly — a home to live in, one to fix up and flip, or a long-term hold to rent out — with its why-line: "The same condo is a different search for each." When they answer, run the short gate on what is then banked: recap it, end with "Did I capture that all correctly?", take their yes — and only then the promise, and the one capture ask if no details were ever given.`;
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
 * The greeting-once correction (defect A): a second in-role
 * greeting has been delivered. The count is the enforcement the
 * step-0 prose rule never had.
 */
export function greetingOnceDirective(): string {
  return `You have already greeted this caller in role once in this session — the turn that just completed greeted them again. The greeting happens ONCE: never greet again in this session — no new time-of-day greeting, no fresh "thank you for calling". Continue from what the caller last said: answer it and carry the conversation forward.`;
}

// ---------------------------------------------------------------------------
// The turn-boundary decision
// ---------------------------------------------------------------------------

export type DiscoveryGateInjection =
  | 'short-gate'
  | 'short-gate-purpose'
  | 'name-known'
  | 'name-release'
  | 'budget-bracket'
  | 'budget-recap'
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
    if (!state.contentBanked && detectTypeOrFeature(visitorUtterance)) {
      state = { ...state, contentBanked: true };
    }
    if (detectPushToSkip(visitorUtterance) || detectRecapAsk(visitorUtterance)) {
      // A push makes the gate owed — and a REPEATED push renews
      // the order even while the gate is still owed from the
      // first one: the caller is insisting, and the one order the
      // first push bought has already been spent unanswered.
      state = { ...state, gateOwed: true, gateOrderFired: false };
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
  const gateRan = turnAsksGateQuestion(modelTurnText);
  if (gateRan) state = { ...state, gateAsked: true, gateOwed: false };
  const offeredBracket = turnOffersBracket(modelTurnText);
  state = { ...state, prevTurnAskedName: askedName };

  if (blocked) return { state, inject: null };
  if (state.fires >= DISCOVERY_GATE_MAX_FIRES) return { state, inject: null };

  const anythingBanked = state.purposeBanked || state.budgetBanked !== '' || state.contentBanked;

  // 1. THE SHORT GATE AT THE SKIP — the gate is owed, the answering
  //    turn did not run it, and the order has not fired for this push.
  if (state.gateOwed && !gateRan && !state.gateOrderFired) {
    return {
      state: { ...state, gateOrderFired: true, fires: state.fires + 1 },
      inject: anythingBanked ? 'short-gate' : 'short-gate-purpose',
    };
  }
  // 2. A BANKED NAME IS NEVER RE-ASKED.
  if (state.visitorName && askedName && state.nameKnownFires < 2) {
    return {
      state: { ...state, nameKnownFires: state.nameKnownFires + 1, fires: state.fires + 1 },
      inject: 'name-known',
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
  // 4a. A STATED BUDGET IS NEVER RE-OPENED by the bracket offer.
  if (state.budgetBanked && offeredBracket && !state.budgetBracketCorrected) {
    return {
      state: { ...state, budgetBracketCorrected: true, fires: state.fires + 1 },
      inject: 'budget-bracket',
    };
  }
  // 4b. THE GATE'S RECAP MUST CARRY THE STATED BUDGET.
  if (state.budgetBanked && gateRan && !state.budgetRecapCorrected
    && !budgetMentionedInTurn(modelTurnText, state.budgetBanked)) {
    return {
      state: { ...state, budgetRecapCorrected: true, fires: state.fires + 1 },
      inject: 'budget-recap',
    };
  }
  // 5. THE GREETING HAPPENS ONCE.
  if (greeted && state.inRoleGreetings >= 2 && !state.greetingCorrected) {
    return {
      state: { ...state, greetingCorrected: true, fires: state.fires + 1 },
      inject: 'greeting-once',
    };
  }
  return { state, inject: null };
}
