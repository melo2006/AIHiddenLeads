// The host→segment TRANSITION GATE for capture (Publish #74,
// 2026-11-15).
//
// THE DEFECT (live-verified in the Publish #70 harness sessions,
// ~/workspace/publish70-verification-2026-11-15.md, Checks 1/2/4):
// #70's consent machinery is correct ONCE ARMED — but it arms on
// the record_captured_contact call, and in both defect sessions the
// model rode the host→simulation transition WITHOUT ever making
// that call. The visitor dictated email + mobile, confirmed "Yes,
// that's right", and the presenter stepped into simulation mode:
// no record, no ask, nothing stored, durability dead on reconnect.
// Policy prose has now failed at this exact transition three times
// (#68's ritual, #70's tightening, and the live retest of both):
// the transition is where the model reliably drops obligations, so
// the obligation is enforced HERE, mechanically, by the proxy —
// which can see the visitor's dictated words in the transcript and
// the durable store's contents, and does not need the model's
// goodwill to compare them.
//
// THE MECHANISM (this module owns detection + the state machine +
// the wording; gemini-live-proxy owns the wiring, exactly like
// _shared/consent-ask.ts):
//
//  1. DICTATED-BUT-UNRECORDED DETECTION. Every completed visitor
//     utterance is scanned for dictated contact facts (an email —
//     typed form or the spoken "… at … dot com" form — and a
//     phone-digit sequence in the 3-3-4 shape or a bounded 10/11
//     digit run). At every model turnComplete the dictated facts
//     are cross-checked against the durable captured-contact store
//     (#68): a fact the store does not hold is UNRECORDED debt.
//  2. THE GATE. While unrecorded debt exists, the turn-boundary
//     decision injects a server-authored directive instead of
//     letting the conversation move on: if the model has not read
//     the facts back, the directive orders the full ritual in
//     order — read-back (email spelled letter by letter, phone in
//     spoken groups, "Did I get that right?"), record via
//     record_captured_contact on confirmation, then the texting
//     ask via #70's machinery (the record's tool response arms it,
//     or the boundary nudge does). If the read-back already
//     happened and the visitor has answered it, the directive
//     orders the record call alone. Fires are capped
//     (CAPTURE_GATE_MAX_FIRES): a session that burns through them
//     simply stays uncaptured — the failure mode is a lost
//     follow-up, never a fabricated fact.
//  3. SEGMENT-START ARMING. A successor session (a persona segment
//     after the swap, or a reconnect) starts with the recap of the
//     conversation so far in its config. The gate arms from that
//     recap at session start — Visitor lines only, and only up to
//     the line where the simulation was entered — cross-checked
//     against the store stamp the session was seeded with, so a
//     capture the parent never recorded is waiting as debt at the
//     segment's first turn boundary instead of being lost with the
//     parent socket.
//  4. SPELL-BACK ENFORCEMENT. #70 tightened the ritual wording and
//     the live read-back STILL came out "tony dot test at example
//     dot com" — the segmented form the policy names as NOT a
//     spell-back. When a model turn renders the capture email in
//     that segmented form, a ONE-TIME correction nudge orders a
//     true letter-by-letter re-read (with the exact character
//     sequence spelled out) before the confirmation counts.
//
// FALSE-POSITIVE DISCIPLINE (a gate that interrupts a clean segment
// is itself a defect): detection reads VISITOR turns only; the
// phone pattern needs the full 3-3-4 shape or a bounded digit run
// (prices, years and card numbers cannot match); a fact the store
// already holds never fires; dictation first heard AFTER the
// simulation entry (roleplay details a visitor gives the simulated
// business) never arms — only facts dictated in the host phase, or
// inherited from the parent recap, are gated; and the decision is
// blocked at exactly the moments #70's is (preview, farewell owns
// the close, transfer connecting, card on screen).

import type { CapturedContact } from './captured-contact.ts';
import { contactReadback } from './visitor-followup.ts';

/** Total gate directives one session will inject. */
export const CAPTURE_GATE_MAX_FIRES = 3;

/** Contact facts found in dictated text. Phone is digit-normalized (last 10). */
export interface DictatedContact {
  email: string;
  phone: string;
}

const NO_FACTS: DictatedContact = { email: '', phone: '' };

/** Digits only, reduced to the last 10 (a leading country 1 is not identity). */
export function normalizePhoneDigits(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const TYPED_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
// The spoken form ASR produces when a visitor dictates an address:
// "tony dot test at example dot com", "tony.test at example dot
// com". Word-bounded "at", at least one "dot" in the domain part —
// a bare "meet at noon"-style phrase can never match.
const SPOKEN_EMAIL = /\b([a-z0-9]+(?:\s*(?:dot|\.)\s*[a-z0-9]+)*)\s+at\s+([a-z0-9]+(?:\s*(?:dot|\.)\s*[a-z0-9]+)+)\b/i;

/**
 * The email a visitor dictated in this text, or ''. Typed form
 * first (exact), then the spoken reconstruction. Conservative by
 * construction: the spoken pattern needs an "at" with a dotted
 * domain after it, and the reconstruction must end in a plausible
 * TLD — anything murkier is a miss, never a guess.
 */
export function detectDictatedEmail(text: string): string {
  if (!text) return '';
  const typed = text.match(TYPED_EMAIL);
  if (typed) return typed[0].toLowerCase();
  const spoken = text.toLowerCase().match(SPOKEN_EMAIL);
  if (!spoken) return '';
  const squeeze = (part: string) => part.replace(/\s*dot\s*/g, '.').replace(/\s*\.\s*/g, '.').replace(/\s+/g, '');
  const local = squeeze(spoken[1]);
  // A fragment like "…me at gmail dot com" reconstructs to an
  // address nobody dictated: the local part must be substantive
  // (3+ characters, or itself dotted) before the shape counts.
  if (local.length < 3 && !local.includes('.')) return '';
  const email = `${local}@${squeeze(spoken[2])}`;
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) ? email : '';
}

const PHONE_SPAN = /\(?\+?\d(?:[\d\s.\-()]*\d)?/g;
const PHONE_SHAPE = /^\+?1?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}$/;

/**
 * The phone number a visitor dictated in this text, digit-
 * normalized, or ''. Candidates are MAXIMAL digit spans (a span
 * swallows every connected digit group), and a span counts only
 * when its FULL digit count is a phone's — 10, or 11 with a
 * leading country 1 — in the 3-3-4 shape or as one contiguous
 * run. That is what keeps the false positives out: a 16-digit
 * card spoken in groups is one 16-digit span, not a phone; a
 * 12-digit order number is one 12-digit span; prices, years and
 * 7-digit fragments never reach 10.
 */
export function detectDictatedPhone(text: string): string {
  if (!text) return '';
  for (const match of text.matchAll(PHONE_SPAN)) {
    const span = match[0].trim();
    const rawDigits = span.replace(/\D/g, '');
    if (rawDigits.length !== 10 && !(rawDigits.length === 11 && rawDigits.startsWith('1'))) continue;
    if (!PHONE_SHAPE.test(span) && span !== rawDigits) continue;
    return normalizePhoneDigits(span);
  }
  return '';
}

/** Both dictated facts in one text (a visitor utterance or a recap's Visitor line). */
export function detectDictatedContact(text: string): DictatedContact {
  return { email: detectDictatedEmail(text), phone: detectDictatedPhone(text) };
}

/**
 * Did this model turn signal the host→simulation entry? The entry
 * announcements are scripted shapes ("now we are stepping into
 * simulation mode", "Please act like a visitor to your own
 * website", "I will treat you as a brand-new caller") — once one
 * is seen, dictation heard later is roleplay for the simulated
 * business and never arms the gate.
 */
export function turnSignalsSimulationEntry(text: string): boolean {
  return /(simulation mode|stepping into( the)? simulation|act like a visitor|brand[- ]new caller|pretend you are (a|the) (visitor|caller))/i.test(text || '');
}

export interface CaptureGateState {
  /** Dictated email not yet known to be recorded ('' = none). */
  email: string;
  /** Dictated phone, digit-normalized ('' = none). */
  phone: string;
  /** The model has read the dictated email back (any rendering). */
  emailReadback: boolean;
  /** The model has read the dictated phone back (any rendering). */
  phoneReadback: boolean;
  /** A model turn has announced the simulation entry. */
  simulationEntered: boolean;
  /** Gate directives injected so far this session. */
  fires: number;
  /** The one-time spell-back correction has been spent. */
  spellbackCorrected: boolean;
}

export const freshCaptureGateState = (): CaptureGateState => ({
  email: '',
  phone: '',
  emailReadback: false,
  phoneReadback: false,
  simulationEntered: false,
  fires: 0,
  spellbackCorrected: false,
});

/**
 * Fold one completed visitor utterance into the gate state. The
 * latest dictation of a field wins (a correction replaces, exactly
 * like the store's merge). Two silences: inside a persona segment
 * the visitor is in roleplay from the first line, and after the
 * simulation entry any new "details" belong to the simulated
 * business — neither arms the gate.
 */
export function noteVisitorUtterance(
  state: CaptureGateState,
  utterance: string,
  opts: { inSegment: boolean },
): CaptureGateState {
  if (opts.inSegment || state.simulationEntered || !utterance) return state;
  const found = detectDictatedContact(utterance);
  if (!found.email && !found.phone) return state;
  return {
    ...state,
    ...(found.email ? { email: found.email } : {}),
    ...(found.phone ? { phone: found.phone } : {}),
  };
}

/**
 * Arm the gate at a successor session's start from the recap the
 * session was authorized with (a segment's swapRecap, or a
 * reconnect's synthesized/client recap). The walk is sequential
 * and role-aware: only Visitor lines are scanned, and the walk
 * stops at the Assistant line that entered the simulation —
 * dictation after it was roleplay. A fact the durable store
 * already holds (in any form) is NOT armed: the store is the
 * visit's durable truth, and a recap dictation the store
 * contradicts was captured — most often corrected — already.
 */
export function armCaptureGateFromRecap(
  state: CaptureGateState,
  recapText: string,
  contact: CapturedContact | null,
): CaptureGateState {
  if (!recapText) return state;
  let out = state;
  for (const line of recapText.split('\n')) {
    if (line.startsWith('Assistant:')) {
      if (turnSignalsSimulationEntry(line)) break;
      continue;
    }
    if (!line.startsWith('Visitor:')) continue;
    const found = detectDictatedContact(line.slice('Visitor:'.length));
    if (found.email) out = { ...out, email: found.email };
    if (found.phone) out = { ...out, phone: found.phone };
  }
  if (out.email && contact?.email) out = { ...out, email: '' };
  if (out.phone && contact?.phone) out = { ...out, phone: '' };
  return out;
}

/**
 * The dictated facts the durable store does NOT hold — the gate's
 * debt. Comparison is form-insensitive: emails compare lowercased
 * (the store already lowercases), phones compare on their last 10
 * digits, so a store entry in any formatting settles the fact.
 */
export function unrecordedFacts(state: CaptureGateState, contact: CapturedContact | null): DictatedContact {
  const email = state.email && contact?.email.trim().toLowerCase() !== state.email ? state.email : '';
  const phone = state.phone && normalizePhoneDigits(contact?.phone || '') !== state.phone ? state.phone : '';
  return { email, phone };
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

/**
 * Did this model turn read the phone back? Both spoken renderings
 * count: digit groups ("954 555 0142") and fully spelled digits
 * ("nine five four, five five five, zero one four two"). The check
 * is a containment test on the turn's digit stream, so formatting
 * and punctuation never matter.
 */
export function turnReadsBackPhone(text: string, phoneDigits: string): boolean {
  if (!text || !phoneDigits) return false;
  const digitStream = text.replace(/\D/g, '');
  if (digitStream.includes(phoneDigits)) return true;
  const wordStream = text.toLowerCase().split(/[^a-z]+/)
    .map((w) => NUMBER_WORDS[w] ?? '')
    .join('');
  return wordStream.includes(phoneDigits);
}

/**
 * How does this model turn render the given email — as a true
 * letter-by-letter spell-back ('spelled'), as whole-word chunks
 * ('segmented' — including reciting the literal address), or not
 * at all (null)? The test is an exact token-sequence match against
 * the two renderings of THIS address, dotted or dotless, so a turn
 * that merely mentions other words can never be misread as a
 * read-back of this email.
 */
export function emailRenderingInTurn(text: string, email: string): 'spelled' | 'segmented' | null {
  if (!text || !email || !email.includes('@')) return null;
  const [localRaw, domainRaw] = email.toLowerCase().split('@');
  const localWords = localRaw.split(/[^a-z0-9]+/).filter(Boolean);
  const domainWords = domainRaw.split(/[^a-z0-9]+/).filter(Boolean);
  if (!localWords.length || domainWords.length < 2) return null;
  const tokens = text.toLowerCase().replace(/@/g, ' at ').replace(/-/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
  const containsSequence = (seq: string[]) => {
    if (!seq.length || seq.length > tokens.length) return false;
    outer: for (let i = 0; i + seq.length <= tokens.length; i++) {
      for (let j = 0; j < seq.length; j++) if (tokens[i + j] !== seq[j]) continue outer;
      return true;
    }
    return false;
  };
  const spelled: string[] = [];
  const segmented: string[] = [];
  const pushPart = (words: string[]) => {
    words.forEach((word, i) => {
      if (i > 0) { spelled.push('dot'); segmented.push('dot'); }
      spelled.push(...word.split(''));
      segmented.push(word);
    });
  };
  pushPart(localWords);
  spelled.push('at'); segmented.push('at');
  pushPart(domainWords);
  if (containsSequence(spelled)) return 'spelled';
  if (containsSequence(spelled.filter((t) => t !== 'dot'))) return 'spelled';
  if (containsSequence(segmented)) return 'segmented';
  if (containsSequence(segmented.filter((t) => t !== 'dot'))) return 'segmented';
  // Reciting the literal address ("tony.test@example.com") is a
  // chunked rendering too — it is never a letter-by-letter spell.
  if (text.toLowerCase().includes(email.toLowerCase())) return 'segmented';
  return null;
}

/** Which facts this model turn read back (any rendering), per fact. */
export function readbackInTurn(text: string, facts: DictatedContact): { email: boolean; phone: boolean } {
  return {
    email: facts.email !== '' && emailRenderingInTurn(text, facts.email) !== null,
    phone: facts.phone !== '' && turnReadsBackPhone(text, facts.phone),
  };
}

const factsPhrase = (facts: DictatedContact): string => {
  const parts: string[] = [];
  if (facts.email) parts.push(`email ${facts.email}`);
  if (facts.phone) parts.push(`mobile ${facts.phone}`);
  return parts.join(' and ');
};

/**
 * The full-sequence directive: the model has NOT read the dictated
 * facts back — it is moving on (in the defect sessions, straight
 * into the simulation) with the capture unmade. Orders the ritual
 * in order, naming the exact facts the proxy detected in the
 * visitor's own dictated words.
 */
export function captureGateDirective(facts: DictatedContact): string {
  return `STOP — do not continue to the next part of this conversation yet. The visitor gave you their contact details — ${factsPhrase(facts)} — and they have NOT been confirmed back or recorded. Finish the capture FIRST, in this order, in role: (1) Read the details back now: spell the email letter by letter — EVERY character, one at a time — read the phone back in its natural spoken groups, and ask "Did I get that right?" (2) When the visitor confirms, call record_captured_contact at once with exactly those details, before any other topic, transition or question. (3) If a mobile number was recorded and the tool result says consentAskRequired, your next spoken turn is the texting question, and you record its answer with record_captured_contact when it lands. Only after the capture is recorded do you continue where you left off.`;
}

/**
 * The record-order directive: the read-back happened and the
 * visitor has answered it, but the record call still has not
 * landed — the exact confirm-then-transition moment of the #70
 * defect. Orders the record alone; the consent ask then arms from
 * the tool response (#70 lever 1) or the boundary nudge (lever 2).
 */
export function captureGateRecordDirective(facts: DictatedContact): string {
  return `The visitor confirmed their details — ${factsPhrase(facts)} — but they are still NOT recorded. Call record_captured_contact NOW with exactly those details (and smsConsent if they have answered the texting question) before anything else — no new topic, no transition. If the tool result says consentAskRequired, your next spoken turn is the texting question: "May we text you on this number?"`;
}

/**
 * The one-time spell-back correction (Publish #74, finding 2):
 * the model's read-back grouped the address into whole words —
 * the exact form the ritual names as NOT a spell-back. Orders a
 * true letter-by-letter re-read, with the exact character sequence
 * for THIS address spelled out so there is nothing to improvise,
 * and voids the confirmation taken on the grouped form.
 */
export function spellbackCorrectionNudge(email: string): string {
  return `Your read-back just grouped the email into whole words — that is NOT a spell-back, and the address is not confirmed. Read it again NOW, every character one at a time, exactly like this: ${contactReadback({ name: '', email, phone: '' }).email} — then ask "Did I get that right?" again and wait for the answer. Do not accept the earlier confirmation.`;
}

export type CaptureGateInjection = 'gate' | 'record' | 'spellback' | null;

/**
 * The turn-boundary decision, evaluated by the proxy at each model
 * turnComplete — the same call pattern as consentAskTurnDecision.
 * `visitorUtterance` is the visitor's completed utterance that
 * preceded the model turn; `blocked` (a preview, or a farewell
 * that owns the close, a connecting transfer, an on-screen card)
 * suppresses every injection while still recording what the turn
 * showed (read-backs, the entry signal), so the debt is judged
 * fresh at the first unblocked boundary.
 */
export function captureGateTurnDecision(input: {
  state: CaptureGateState;
  contact: CapturedContact | null;
  modelTurnText: string;
  visitorUtterance: string;
  blocked: boolean;
}): { state: CaptureGateState; inject: CaptureGateInjection; facts: DictatedContact } {
  const { contact, modelTurnText, visitorUtterance, blocked } = input;
  let state = input.state;
  // Observations first: they hold whether or not this boundary may
  // inject. The entry signal freezes NEW arming (handled in
  // noteVisitorUtterance); facts already dictated stay owed.
  if (!state.simulationEntered && turnSignalsSimulationEntry(modelTurnText)) {
    state = { ...state, simulationEntered: true };
  }
  const facts = unrecordedFacts(state, contact);
  // Read-back bookkeeping is judged against the facts as they stood
  // BEFORE this turn: a visitor utterance at THIS boundary can only
  // be an answer to a read-back an EARLIER turn performed.
  const readbackBefore = { email: state.emailReadback, phone: state.phoneReadback };
  const rb = readbackInTurn(modelTurnText, facts);
  if (rb.email && !state.emailReadback) state = { ...state, emailReadback: true };
  if (rb.phone && !state.phoneReadback) state = { ...state, phoneReadback: true };

  // SPELL-BACK ENFORCEMENT: a segmented rendering of the capture
  // email — dictated this visit or already in the store — earns
  // the one-time correction, ahead of the gate itself: the
  // confirmation the gate would chase is not valid until the
  // address has been spelled properly.
  const renderingEmail = state.email || contact?.email || '';
  if (!state.spellbackCorrected && renderingEmail && emailRenderingInTurn(modelTurnText, renderingEmail) === 'segmented') {
    if (blocked) return { state, inject: null, facts };
    // The grouped read-back does NOT count as a ritual read-back:
    // the confirmation taken on it is void, so the email's
    // read-back flag resets — the record-order below must wait
    // for a fresh answer to the corrected spell-back.
    const reset = state.email && state.email === renderingEmail ? { emailReadback: false } : {};
    return { state: { ...state, ...reset, spellbackCorrected: true }, inject: 'spellback', facts: { email: renderingEmail, phone: '' } };
  }

  if (!facts.email && !facts.phone) return { state, inject: null, facts };
  if (blocked) return { state, inject: null, facts };
  if (state.fires >= CAPTURE_GATE_MAX_FIRES) return { state, inject: null, facts };

  const unreadFacts: DictatedContact = {
    email: facts.email && !state.emailReadback ? facts.email : '',
    phone: facts.phone && !state.phoneReadback ? facts.phone : '',
  };
  if (unreadFacts.email || unreadFacts.phone) {
    // Some dictated fact has never been read back: order the full
    // ritual for everything still unrecorded.
    return { state: { ...state, fires: state.fires + 1 }, inject: 'gate', facts };
  }
  const answeredBefore: DictatedContact = {
    email: facts.email && readbackBefore.email ? facts.email : '',
    phone: facts.phone && readbackBefore.phone ? facts.phone : '',
  };
  // A read-back performed in THIS turn has its confirmation still
  // outstanding — the visitor utterance at this boundary answered
  // an earlier turn, never this question — so the record waits
  // for the next boundary regardless.
  const readbackThisTurn = rb.email || rb.phone;
  if (!readbackThisTurn && (answeredBefore.email || answeredBefore.phone) && visitorUtterance.trim() !== '') {
    // Everything unrecorded was read back on an earlier turn and
    // the visitor has since answered — and the store STILL holds
    // none of it. Order the record.
    return { state: { ...state, fires: state.fires + 1 }, inject: 'record', facts: answeredBefore };
  }
  // Read back, awaiting the visitor's answer — wait quietly.
  return { state, inject: null, facts };
}
