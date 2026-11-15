// Publish #79 — the SALES CAPTURE GATE (2026-11-15).
//
// Ron's decision (2026-11-15 17:51 EST): in Aspen's SALES
// conversations — the homepage session and every session carrying
// the sales layer — the visitor's email and phone are NOT collected
// during qualification or mid-pitch. Capture happens ONCE, at the
// END: after the visitor has seen the value and shown interest (or
// as the conversation reaches its natural close), Aspen makes ONE
// framed ask — an offer to SEND something useful (the demo link, a
// copy of this conversation, a follow-up), explicitly including the
// share angle: something they can pass to their manager, a
// colleague, or the owner. A decline or a deflection ends it for the
// session; a session with no interest signal gets no ask at all.
//
// What the gate does NOT touch:
//  - Details the visitor VOLUNTEERS at any point: the #68/#74
//    capture machinery (read-back, record, the texting-consent
//    confirm — law, not an ask) owns those, exactly as before. The
//    moment dictation is observed, this gate stands down for good.
//  - Frank's REALTOR DISCOVERY flow: its step-2 list-reason capture
//    ask is Ron's 2026-11-14 design and is out of scope. Discovery
//    sessions are simulations; this gate is armed only on
//    homepage-sales sessions (config.homepageSales === true and
//    config.simulation !== true), so it can never fire there.
//  - The demo step-out close: the simulation close script already
//    carries the summary offer + one capture ask at the end
//    (2026-11-14); DEMO_SALES_POLICY's new prose states the same
//    timing for the step-out, and this gate never arms on
//    simulation sessions.
//
// The proxy keeps the ledger — interest shown, close reached, the
// ask fired / declined, contact already held — folded from the
// visitor's own words and observed from the model's own turns, and
// the turn-boundary decision injects at most one directive, in this
// priority order:
//   1. NO-REPEAT — the model asked for contact details again after
//      the one end-ask was already spent (above all: after the
//      visitor declined it).
//   2. EARLY-ASK CORRECTION — the model asked for email/phone
//      before any interest signal or close: capture is end-timed,
//      and the ask is withdrawn back into the conversation.
//   3. THE END-ASK — interest has landed, no contact is held or
//      volunteered, and the framed ask has not been made: order
//      it, in Ron's framing.
//
// Publish #81 (2026-11-15) — the order PERSISTS until complied
// with. The #79 verification showed the affirmative half failing
// live, twice, with one shape: the interest turn ("what does it
// cost per month, and how would I get started?") was answered
// with pricing closing on a MEETING-BOOKING offer, the framed
// send-offer was never spoken, and the only collection that
// occurred was the booking form's own ask ("spell your first
// and last name and provide your email address?") — which the
// ask detector could not even see. A one-shot order gets
// displaced exactly like that (the same lesson Publish #80
// taught the discovery gate), so now:
//   - the end-ask order re-fires ONCE, sterner, at the next
//     boundary if the framed ask still has not landed — whatever
//     the model did instead, the booking offer included; the
//     sterner order states plainly that the send-offer is owed
//     BEFORE anything else is collected, and that the booking
//     offer may follow it, never replace it or go first;
//   - a capture ask WITHOUT the send-offer framing (a bare ask,
//     or the booking form's name-led collection) while the
//     end-ask is owed does NOT satisfy it — it draws that same
//     sterner order on the spot. Once the framed ask HAS been
//     made, booking-form collection proceeds unimpeded: it is
//     the legitimate booking flow, not a repeat;
//   - fires are capped at 2 per interest episode and
//     SALES_GATE_END_ASK_TOTAL_FIRES per session; a fresh
//     interest signal after an episode's fires run out re-arms
//     a new episode. A close with no interest behind it still
//     arms nothing: no interest signal, no ask at all.

import { detectDictatedContact } from './capture-gate.ts';

export const SALES_GATE_MAX_FIRES = 5;

/** End-ask order fires across the whole session (Publish #81):
 * two per interest episode, at most two episodes — the arming
 * order plus its sterner repeat, twice over, and no more. (The
 * session-wide SALES_GATE_MAX_FIRES sits one above this so a
 * correction can still land alongside a full two-episode arc;
 * each directive family keeps its own tighter cap regardless.) */
export const SALES_GATE_END_ASK_TOTAL_FIRES = 4;

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/**
 * Did this model turn ASK for the visitor's email or phone? Only
 * genuine asks count — never the capture ritual's own beats: a
 * read-back / spell-back confirmation ("did I get that right?") is
 * the visitor's volunteered detail being confirmed, and the
 * texting-consent question ("may we text you on this number?") is
 * the law's confirm, not an ask. A name-only ask never matches:
 * names are conversation, not capture.
 */
export function turnAsksForContact(text: string): boolean {
  const t = text || '';
  // The ritual's own beats are never an ask.
  if (/did i get that right|let me read that back|read that back to you/i.test(t)) return false;
  if (/(may we|can we|okay to|ok to|is it okay to|permission to)[^.?!]{0,30}\btext\b/i.test(t)) return false;
  return (
    /what'?s your (best )?(e-?mail|phone|mobile|cell)/i.test(t) ||
    /what is your (best )?(e-?mail|phone|mobile|cell)/i.test(t) ||
    /what'?s the best (mobile |cell )?(number|e-?mail)/i.test(t) ||
    /what (e-?mail|phone number|mobile number|cell number) (should|can|do) (we|i)\b/i.test(t) ||
    /may i have your (e-?mail|phone|mobile|cell|number)/i.test(t) ||
    /can i (have|get|take) your (e-?mail|phone|mobile|cell|number)/i.test(t) ||
    /could i (have|get) your (e-?mail|phone|mobile|cell|number)/i.test(t) ||
    /(give|share|tell|drop|leave) me your (e-?mail|phone|mobile|cell|number)/i.test(t) ||
    /(provide|enter) your (e-?mail|phone|mobile|cell)/i.test(t) ||
    /i'?ll need your (e-?mail|phone|mobile|cell|number)/i.test(t) ||
    /where (should|can) i (send|text|e-?mail) (it|that|this|them)/i.test(t) ||
    // Publish #81: the booking form's name-led collection IS a
    // capture ask for gate purposes — it was invisible before,
    // and it is the path that actually collected an email in the
    // #79 verification while the end-ask stood owed.
    turnCollectsBookingContact(t)
  );
}

const BOOKING_COLLECTION_PATTERNS: RegExp[] = [
  /spell (me )?your (first|last|full)\b/i,
  /spell (me )?(your |the )?(first and last|full) name/i,
  /(first and last name|full name)[^.?!]{0,80}(e-?mail|phone number|mobile|cell)/i,
  /(e-?mail|phone number|mobile|cell)[^.?!]{0,80}(first and last name|full name)/i,
];

/**
 * Is this turn the BOOKING FORM's collection — a name-led ask
 * tied to scheduling ("To get that introductory meeting
 * scheduled, could you please spell your first and last name and
 * provide your email address?")? It is a capture ask, but it is
 * not the framed end-ask: while the end-ask is owed it is the
 * violation shape, and once the end-ask has been made it is the
 * legitimate booking flow proceeding.
 */
export function turnCollectsBookingContact(text: string): boolean {
  return bookingCollectionIndexInTurn(text) >= 0;
}

/** The earliest character index of a booking-collection pattern
 * in the turn, or -1 — used to judge whether the send-offer LED
 * a turn that contains both. */
export function bookingCollectionIndexInTurn(text: string): number {
  const t = text || '';
  let best = -1;
  for (const p of BOOKING_COLLECTION_PATTERNS) {
    const m = p.exec(t);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

const SEND_OFFER_PATTERNS: RegExp[] = [
  /copy of (this|our|the) conversation/i,
  /pass (it|this|that|them) (along |over )?to (your |their |a )?(manager|colleague|colleagues|owner|boss|partner)/i,
  /something (you|they) can (pass|share|show|send)/i,
  /(send|text|e-?mail) you (the |a |that |this |your )?(demo |booking )?(link|copy|follow-?up|recap|transcript)/i,
  /follow-?up from (the|our) team/i,
  /show (it|this|that|them) to (your |a )?(manager|colleague|colleagues|owner|boss|partner)/i,
  /so (you|they) can (replay|share|show) (it|this|that|them)/i,
];

/** The earliest character index of send-offer framing in the
 * turn, or -1: the demo link to replay, a copy of this
 * conversation, a follow-up from the team, the share angle. */
export function sendOfferIndexInTurn(text: string): number {
  const t = text || '';
  let best = -1;
  for (const p of SEND_OFFER_PATTERNS) {
    const m = p.exec(t);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

/** Does this turn carry the SEND-OFFER framing — the offer to
 * send something useful (with the share angle) that makes a
 * capture ask the framed end-ask rather than a bare collection? */
export function turnMakesSendOffer(text: string): boolean {
  return sendOfferIndexInTurn(text) >= 0;
}

export type ModelAskKind = 'framed' | 'booking' | 'bare' | 'none';

/**
 * Classify a model turn's capture ask (Publish #81):
 *  - 'framed'  — an ask carrying the send-offer framing: the
 *    end-ask itself. If a turn also collects for a booking, the
 *    send-offer must LEAD (appear first) for the turn to count
 *    as framed; a collection that goes first is 'booking'.
 *  - 'booking' — the booking form's name-led collection with no
 *    leading send-offer.
 *  - 'bare'    — any other contact ask, unframed.
 *  - 'none'    — no capture ask at all.
 */
export function classifyModelAsk(text: string): ModelAskKind {
  if (!turnAsksForContact(text)) return 'none';
  const sendIdx = sendOfferIndexInTurn(text);
  if (sendIdx >= 0) {
    const bookIdx = bookingCollectionIndexInTurn(text);
    if (bookIdx >= 0 && bookIdx < sendIdx) return 'booking';
    return 'framed';
  }
  if (turnCollectsBookingContact(text)) return 'booking';
  return 'bare';
}

/**
 * Did the visitor show INTEREST — the signal that earns the
 * end-ask? Ron's signals: asks the price or the next steps, asks
 * how to start, responds positively to the pitch, hands over their
 * website for the demo, or moves to book / meet / talk to a human.
 * Qualification answers (their trade, their call volume, their
 * numbers) are conversation, not interest, and never match.
 */
export function detectInterestSignal(text: string): boolean {
  const t = text || '';
  return (
    /\bhow much\b|\bwhat(?:'s| is) the (price|cost)\b|\bpricing\b|\bhow much does\b/i.test(t) ||
    /how do i (get started|start|sign up)|get(ting)? started|sign (me )?up|next steps?|how (do|would) (we|i) (set|get) (it|this|that) (up|going)|set (it|this|me) up/i.test(t) ||
    /let'?s do it|sounds good|that sounds (great|good|perfect|interesting)|i'?m interested|i am interested|i like (it|that|this)|sounds (great|perfect)/i.test(t) ||
    /book (a|the|it|me)\b|schedule (a|the|it)\b|talk to (alex|a human|someone|sales|the team)|meet with/i.test(t) ||
    /show me|see the demo|try (it|the demo)|run the demo|my website|here'?s my (site|website|url)/i.test(t) ||
    /\b[a-z0-9][a-z0-9-]*\.(com|net|org|io|co)\b/i.test(t)
  );
}

/**
 * Did the visitor begin the natural CLOSE — wrapping up or saying
 * goodbye? A close with interest already shown earns the end-ask
 * as the final offer; a cold close earns the warm goodbye alone
 * (the gate simply never arms without interest having been folded
 * in — and the LEAVING RULE prose carries that discipline).
 */
export function detectCloseSignal(text: string): boolean {
  return /that'?s all|that'?s everything|that covers it|nothing else|i (have|got|need) to go|gotta go|good ?bye|\bbye\b|wrap (this|it) up|i'?m (done|good) (here|thanks)/i.test(text || '');
}

/**
 * Did the visitor DECLINE the capture ask? Judged only once the
 * ask has fired: a "no thanks" to anything else is conversation.
 * Deflection shapes count — "not now", "maybe later", "I'll pass"
 * are declines for capture purposes: the one ask is spent either
 * way, and a repeat would be nagging.
 */
export function detectAskDecline(text: string): boolean {
  return /no thanks|not (right )?now|maybe later|rather not|prefer not|don'?t want to (give|share)|not comfortable|don'?t give (out|my)|i'?ll pass|skip (that|it)|no,? i'?m (good|fine|okay)\b/i.test(text || '');
}

/**
 * Does this model turn itself begin the close — step-out language,
 * a summary, a warm wrap-up? An ask inside such a turn IS the
 * end-ask, wherever the visitor's own signals stand: the close is
 * one of Ron's two arming conditions.
 */
export function turnBeginsClose(text: string): boolean {
  return /before you go|before we wrap|to wrap up|in summary|to sum up|stepping out of|thanks (so much )?for (your time|chatting|stopping by)|great (talking|chatting) with you/i.test(text || '');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SalesGateState {
  /** The visitor showed an interest signal (folded from their
   * own words; a recap seed counts too). */
  interestSeen: boolean;
  /** The visitor began a wrap-up / goodbye. */
  closeSeen: boolean;
  /** The one end-ask is spent — delivered by the model or ordered
   * by this gate. It never un-spends. */
  askFired: boolean;
  /** The model actually spoke a capture ask (as opposed to the
   * gate merely ordering one). */
  askDelivered: boolean;
  /** The gate ordered the end-ask at the previous boundary and
   * the model's next turn is expected to deliver it — an ask on
   * that turn is compliance, not a repeat. */
  awaitingDelivery: boolean;
  /** The visitor declined or deflected the fired ask. Final. */
  askDeclined: boolean;
  /** The visitor dictated contact details at some point: the
   * #68/#74 machinery owns capture from there and this gate
   * stands down permanently. */
  volunteered: boolean;
  /** The session already holds a captured email or phone (the
   * durable store), so no ask is ever owed. */
  contactHeld: boolean;
  /** Early-ask corrections injected (cap 2). */
  earlyAskCorrections: number;
  /** Repeat-ask corrections injected (cap 2). */
  repeatCorrections: number;
  /** End-ask orders injected in the CURRENT interest episode
   * (Publish #81: cap 2 — the arming order plus one sterner
   * repeat; the order persists until the framed ask observably
   * lands. A fresh interest signal after the cap runs out
   * re-arms a new episode and resets this to 0). */
  endAskFires: number;
  /** End-ask orders injected across the whole session
   * (Publish #81: the re-arm bound — never more than
   * SALES_GATE_END_ASK_TOTAL_FIRES). */
  endAskTotalFires: number;
  /** The most recent end-ask fire was the sterner repeat (a
   * second fire in its episode, or a fire answering a collection
   * that jumped the queue) — the proxy picks the sterner
   * directive variant from it. Reset by every standard fire. */
  endAskRepeat: boolean;
  /** Total directives injected this session. */
  fires: number;
}

export const freshSalesGateState = (): SalesGateState => ({
  interestSeen: false,
  closeSeen: false,
  askFired: false,
  askDelivered: false,
  awaitingDelivery: false,
  askDeclined: false,
  volunteered: false,
  contactHeld: false,
  earlyAskCorrections: 0,
  repeatCorrections: 0,
  endAskFires: 0,
  endAskTotalFires: 0,
  endAskRepeat: false,
  fires: 0,
});

/**
 * Arm the gate at a successor session's start from the recap the
 * session was authorized with (a reconnect's recap): the same
 * folds the live boundary runs, so an interest signal shown, an
 * ask already made, or details already volunteered in the parent
 * session are never re-opened by the successor. Conservative by
 * design: any model line in the recap that asked for contact
 * counts the one ask as spent.
 */
export function armSalesGateFromRecap(
  state: SalesGateState,
  recapText: string,
  contact?: { email?: string | null; phone?: string | null } | null,
): SalesGateState {
  let out = state;
  if (contact && (contact.email || contact.phone)) out = { ...out, contactHeld: true };
  const recap = recapText || '';
  if (!recap) return out;
  for (const line of recap.split('\n')) {
    if (line.startsWith('Visitor:')) {
      const utterance = line.slice('Visitor:'.length);
      const dictated = detectDictatedContact(utterance);
      if (dictated.email || dictated.phone) out = { ...out, volunteered: true };
      if (!out.interestSeen && detectInterestSignal(utterance)) out = { ...out, interestSeen: true };
      if (!out.closeSeen && detectCloseSignal(utterance)) out = { ...out, closeSeen: true };
    } else if (!out.askFired && turnAsksForContact(line)) {
      out = { ...out, askFired: true, askDelivered: true };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Directives (server-authored; each orders the NEXT spoken turn)
// ---------------------------------------------------------------------------

/** Ron's framing, verbatim in substance: the send offer, the
 * useful thing, and the share angle — pass it to a manager, a
 * colleague, or the owner. */
export const END_ASK_FRAMING = 'offer to SEND them something useful — the link to this demo so they can replay it, a copy of this conversation, or a follow-up from the team — something they can pass to their manager, a colleague, or the owner';

/**
 * The early-ask correction: the model asked for email/phone
 * before value + interest. The ask is withdrawn back into the
 * conversation; capture is end-timed. The second firing is the
 * sterner repeat, for a model that asked early again anyway.
 */
export function earlyAskDirective(second: boolean): string {
  if (second) {
    return `You asked for the visitor's contact details early AGAIN. On the sales path that ask belongs at the END — after the visitor has seen the value and shown interest — and nowhere else: not in qualification, not mid-pitch, not while a demo loads. Do not ask for an email address or a phone number again until the visitor shows interest or the conversation reaches its close. Pick up what the visitor just said and continue the sales conversation from there.`;
  }
  return `STOP — you just asked for the visitor's email or phone number, but they have not yet seen the value or shown any interest. On the sales path, contact capture happens ONCE, at the END — asking during qualification or mid-pitch is barred. Do not repeat the ask and do not return to it: continue the sales conversation from what the visitor just said — their business, their calls, their numbers — and let the value land first. (If the visitor VOLUNTEERS their details at any point, take them gladly through the normal read-back ritual — volunteered details are always welcome; only the early ASK is barred.)`;
}

/**
 * The end-ask order: interest has landed, nothing is held or
 * volunteered, and the framed ask has not been made. Orders the
 * ONE framed ask in the next turn, at the next natural pause —
 * never as an interruption of an answer in flight. The `repeat`
 * variant (Publish #81) is the sterner re-firing: the send-offer
 * is still owed and comes BEFORE anything else is collected —
 * before a meeting is booked and before any name or email is
 * taken to schedule one; the booking offer may follow it in the
 * same turn, never replace it or go first.
 */
export function endAskDirective(repeat = false): string {
  if (repeat) {
    return `The framed send-offer is STILL owed — it has not been made, and it comes BEFORE anything else is collected: before a meeting is booked, and before any name or email is taken to schedule one. Make it now, leading your next turn, exactly once: ${END_ASK_FRAMING}. Ask for the email address or the mobile number that send should go to. Only after that offer is made may the booking conversation continue — the meeting offer may follow the send-offer in the same turn, but it never replaces it and never goes first. If they say yes to the send, collect the detail through the normal capture ritual — read it back, spell the email, confirm the number, and ask the texting permission before any text is promised. If they decline or wave it off, accept it in one warm line and NEVER ask again in this session.`;
  }
  return `The visitor has shown interest, and the one capture ask of this sales conversation is now earned — make it in your next turn, at the next natural pause, as a SEND offer, exactly once: ${END_ASK_FRAMING}. Ask for the email address or the mobile number that send should go to. If they say yes, collect the detail through the normal capture ritual — read it back, spell the email, confirm the number, and ask the texting permission before any text is promised. If they decline or wave it off, accept it in one warm line and NEVER ask again in this session. Do not stack the ask on top of an unfinished answer: finish the thought you owe them first, then make the offer as its own beat.`;
}

/**
 * The no-repeat correction: the one ask was already spent and the
 * model asked again — worst of all after a decline. The question
 * is closed for the session; the conversation closes warmly
 * without it.
 */
export function noRepeatDirective(second: boolean): string {
  if (second) {
    return `You asked for the visitor's contact details yet AGAIN after being told the question is closed. It stays closed — no contact ask of any form for the rest of this session. Close warmly on the conversation you have had, or keep helping them with what they actually asked about — and let the details go.`;
  }
  return `STOP — the one capture ask of this sales conversation has already been made, and you just asked again. One ask is the whole allowance: a decline or a deflection ends it, and even without an answer it is never repeated in this session. Do not ask for an email address or a phone number again in any form. Accept whatever the visitor just said warmly and continue — or, if the conversation is ending, close warmly without the ask.`;
}

// ---------------------------------------------------------------------------
// The turn-boundary decision
// ---------------------------------------------------------------------------

export type SalesGateInjection = 'early-ask' | 'end-ask' | 'no-repeat' | null;

/**
 * The turn-boundary decision, evaluated by the proxy at each model
 * turnComplete on homepage-sales sessions — the same call pattern
 * as captureGateTurnDecision / discoveryGateTurnDecision. The
 * visitor's completed utterance is folded in FIRST (interest,
 * close and volunteered dictation are judged on everything the
 * visitor has said, including the utterance this turn answered),
 * the model turn is then observed, and at most one directive is
 * chosen, in the priority order the header lays out. `blocked`
 * (a preview, a farewell that owns the close, a connecting
 * transfer, an on-screen card — or a boundary where the capture
 * gate or the consent ask already injected) suppresses every
 * injection while the fold and the observations still land, so
 * the state is judged fresh at the first unblocked boundary.
 */
export function salesGateTurnDecision(input: {
  state: SalesGateState;
  contact: { email?: string | null; phone?: string | null } | null | undefined;
  modelTurnText: string;
  visitorUtterance: string;
  blocked: boolean;
}): { state: SalesGateState; inject: SalesGateInjection } {
  const { visitorUtterance, modelTurnText, blocked } = input;
  let state = input.state;

  // The durable store outranks every fold: a session already
  // holding a captured email or phone never owes an ask.
  if (!state.contactHeld && input.contact && (input.contact.email || input.contact.phone)) {
    state = { ...state, contactHeld: true };
  }

  // ---- FOLD the visitor's completed utterance -------------------------
  if (visitorUtterance) {
    const dictated = detectDictatedContact(visitorUtterance);
    if (dictated.email || dictated.phone) state = { ...state, volunteered: true };
    if (detectInterestSignal(visitorUtterance)) {
      if (!state.interestSeen) {
        state = { ...state, interestSeen: true };
      } else if (
        // Publish #81: a FRESH interest signal after the current
        // episode's orders ran out re-arms the debt — a new
        // episode with its own two fires, still bounded by the
        // session total. Interest alone, with fires remaining,
        // changes nothing: the outstanding order simply persists.
        state.endAskFires >= 2
        && state.endAskTotalFires < SALES_GATE_END_ASK_TOTAL_FIRES
        && !state.askDelivered && !state.askDeclined
      ) {
        state = { ...state, endAskFires: 0, endAskRepeat: false };
      }
    }
    if (!state.closeSeen && detectCloseSignal(visitorUtterance)) {
      state = { ...state, closeSeen: true };
    }
    if (state.askFired && !state.askDeclined && detectAskDecline(visitorUtterance)) {
      state = { ...state, askDeclined: true };
    }
  }

  // ---- OBSERVE the model turn that just completed ---------------------
  // Publish #81: the turn's capture ask is CLASSIFIED, not just
  // detected. Only the FRAMED ask — a capture ask carrying the
  // send-offer framing, leading any booking collection in the
  // same turn — counts as the end-ask made. A bare ask or the
  // booking form's collection while the framed ask is owed and
  // unmade is the violation shape: the order persists.
  const askKind = classifyModelAsk(modelTurnText);
  const asked = askKind !== 'none';
  const modelClose = turnBeginsClose(modelTurnText);
  const wasAwaitingDelivery = state.awaitingDelivery;
  let repeatCandidate = false;
  let earlyCandidate = false;
  let violationCandidate = false;
  if (state.awaitingDelivery) state = { ...state, awaitingDelivery: false };
  if (asked) {
    if (state.askDeclined) {
      // ANY capture ask after the visitor declined the one ask —
      // bare, framed or booking-form — is a repeat.
      repeatCandidate = true;
    } else if (askKind === 'framed') {
      if (state.askDelivered) {
        repeatCandidate = true;
      } else if (state.interestSeen || state.closeSeen || modelClose || wasAwaitingDelivery) {
        // The framed send-offer ask, made: compliance with an
        // outstanding order (whenever it lands), the model's own
        // on-time ask, or its one close offer. The ask is spent,
        // delivered — the debt is discharged.
        state = { ...state, askFired: true, askDelivered: true };
      } else {
        // A framed send-offer ask during qualification is still
        // an early ask: capture before value + interest.
        earlyCandidate = true;
      }
    } else if (askKind === 'booking') {
      if (state.askDelivered) {
        // The framed ask was made; the booking flow collecting
        // its scheduling details afterwards is legitimate and
        // proceeds unimpeded — not a repeat, not a violation.
      } else if (state.interestSeen) {
        // Collection jumped the queue: the framed send-offer is
        // owed and unmade, and the booking form collected first.
        violationCandidate = true;
      } else {
        earlyCandidate = true;
      }
    } else {
      // A bare, unframed ask.
      if (state.askDelivered) {
        repeatCandidate = true;
      } else if (state.interestSeen) {
        // An unframed ask while the framed end-ask is owed does
        // not satisfy it (Publish #81) — the order persists and
        // the sterner repeat answers this turn. (If the visitor
        // answers the bare ask, their dictation stands the gate
        // down at the next fold and the #68/#74 ritual owns it.)
        violationCandidate = true;
      } else if (state.closeSeen || modelClose) {
        // #79's judgment, preserved: the model's own ask inside
        // its close-flavored turn, with no interest behind it, is
        // its one final offer — spent, not corrected.
        state = { ...state, askFired: true, askDelivered: true };
      } else {
        earlyCandidate = true;
      }
    }
  }

  // ---- DECIDE ----------------------------------------------------------
  // Volunteered details and held contact end the gate's work for
  // good: #68/#74 own capture there, and no ask is ever owed.
  if (state.volunteered || state.contactHeld) return { state, inject: null };
  if (blocked) return { state, inject: null };
  if (state.fires >= SALES_GATE_MAX_FIRES) return { state, inject: null };

  // 1. NO-REPEAT — the ask was already spent and the model asked
  //    again. Fires even over a decline folded this boundary: that
  //    is exactly the re-ask that must never land.
  if (repeatCandidate && state.repeatCorrections < 2) {
    return {
      state: { ...state, repeatCorrections: state.repeatCorrections + 1, fires: state.fires + 1 },
      inject: 'no-repeat',
    };
  }
  // 2. EARLY-ASK CORRECTION — an ask with no interest and no close
  //    behind it. (A declined ask is already spent, so an early
  //    candidate can only exist before the one ask ever fired.)
  if (earlyCandidate && state.earlyAskCorrections < 2) {
    return {
      state: { ...state, earlyAskCorrections: state.earlyAskCorrections + 1, fires: state.fires + 1 },
      inject: 'early-ask',
    };
  }
  // 3. THE END-ASK — owed while interest stands behind it and the
  //    FRAMED ask has neither landed nor been declined. Its order
  //    PERSISTS until complied with (Publish #81): it fires at
  //    the boundary where interest lands and the answering turn
  //    made no framed ask; if the framed ask still has not landed
  //    at the next boundary — whatever the model did instead, the
  //    meeting-booking offer included — it re-fires ONCE, sterner;
  //    and a collection that jumped the queue (a bare ask, or the
  //    booking form's name-led collection) draws that sterner
  //    order on the spot. Caps: 2 fires per interest episode,
  //    SALES_GATE_END_ASK_TOTAL_FIRES per session; a fresh
  //    interest signal after an episode runs out re-arms (fold).
  //    A close WITHOUT interest never arms the order (rule 3:
  //    no interest signal, no ask at all).
  if (!state.askDelivered && !state.askDeclined && state.interestSeen
    && state.endAskFires < 2 && state.endAskTotalFires < SALES_GATE_END_ASK_TOTAL_FIRES
    && (violationCandidate || !asked)) {
    const repeat = violationCandidate || state.endAskFires >= 1;
    return {
      state: {
        ...state,
        askFired: true,
        awaitingDelivery: true,
        endAskFires: state.endAskFires + 1,
        endAskTotalFires: state.endAskTotalFires + 1,
        endAskRepeat: repeat,
        fires: state.fires + 1,
      },
      inject: 'end-ask',
    };
  }
  return { state, inject: null };
}
