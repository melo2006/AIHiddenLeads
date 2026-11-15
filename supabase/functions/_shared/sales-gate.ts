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
//      volunteered, and the model's answering turn did not make
//      the framed ask: order it once, in Ron's framing. If the
//      order goes undelivered and a genuine close arrives later,
//      it may be ordered once more there — never a third time. A
//      close with no interest behind it arms nothing: no interest
//      signal, no ask at all.

import { detectDictatedContact } from './capture-gate.ts';

export const SALES_GATE_MAX_FIRES = 3;

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
    /i'?ll need your (e-?mail|phone|mobile|cell|number)/i.test(t) ||
    /where (should|can) i (send|text|e-?mail) (it|that|this|them)/i.test(t)
  );
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
  /** End-ask orders injected (cap 2: the arming order, plus one
   * re-order at a genuine close if the first went undelivered). */
  endAskFires: number;
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
 * The end-ask order: interest or a close has landed, nothing is
 * held or volunteered, and the model's last turn did not make the
 * ask. Orders the ONE framed ask in the next turn, at the next
 * natural pause — never as an interruption of an answer in flight.
 */
export function endAskDirective(): string {
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
    if (!state.interestSeen && detectInterestSignal(visitorUtterance)) {
      state = { ...state, interestSeen: true };
    }
    if (!state.closeSeen && detectCloseSignal(visitorUtterance)) {
      state = { ...state, closeSeen: true };
    }
    if (state.askFired && !state.askDeclined && detectAskDecline(visitorUtterance)) {
      state = { ...state, askDeclined: true };
    }
  }

  // ---- OBSERVE the model turn that just completed ---------------------
  const asked = turnAsksForContact(modelTurnText);
  const modelClose = turnBeginsClose(modelTurnText);
  const askFiredAtEntry = state.askFired;
  const wasAwaitingDelivery = state.awaitingDelivery;
  let repeatCandidate = false;
  let earlyCandidate = false;
  if (state.awaitingDelivery) state = { ...state, awaitingDelivery: false };
  if (asked) {
    if (wasAwaitingDelivery) {
      // The ordered end-ask, delivered. Compliance, not a repeat.
      state = { ...state, askDelivered: true };
    } else if (askFiredAtEntry) {
      repeatCandidate = true;
    } else if (state.interestSeen || state.closeSeen || modelClose) {
      // The model made the end-ask itself, on time: it is spent.
      state = { ...state, askFired: true, askDelivered: true };
    } else {
      earlyCandidate = true;
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
  // 3. THE END-ASK — interest has landed, the ask is unspent, and
  //    the model's answering turn did not make it. Ordered once;
  //    if that order goes undelivered, a genuine close may
  //    re-order it once — never a third time. A close WITHOUT
  //    interest never arms the order (rule 3: no interest signal,
  //    no ask at all) — the close only re-arms an ask that
  //    interest already earned.
  if (!state.askFired && !state.askDeclined && !asked
    && state.interestSeen && state.endAskFires < 1) {
    return {
      state: { ...state, askFired: true, awaitingDelivery: true, endAskFires: state.endAskFires + 1, fires: state.fires + 1 },
      inject: 'end-ask',
    };
  }
  if (state.askFired && !state.askDelivered && !state.askDeclined && !asked
    && state.closeSeen && state.endAskFires < 2) {
    return {
      state: { ...state, awaitingDelivery: true, endAskFires: state.endAskFires + 1, fires: state.fires + 1 },
      inject: 'end-ask',
    };
  }
  return { state, inject: null };
}
