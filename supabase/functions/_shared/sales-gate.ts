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
//
// Publish #84 (2026-11-15) — the end-ask made RELIABLE and
// COMPLETE. Publish #83's re-script moved the model (the framed
// send-offer fired inside the interest answer in 2 of 3 live
// runs, S3/S4/S1/S5 all pass), but three residuals remained,
// all observed live in the #83 verification:
//
//   1. RELIABILITY — in the failing S2 run the interest ANSWER
//      carried no offer, and the post-turn order then had to
//      fight the next turn (the scripted accept drew bare
//      collection). The successes were the runs where the offer
//      was inside the interest answer itself. So the order now
//      also fires PRE-ANSWER: salesGatePreAnswerDecision folds
//      the visitor's utterance at the moment it arrives (the
//      proxy's text transport hands the proxy the full utterance
//      BEFORE the model sees it) and, on a fresh interest
//      signal, the proxy attaches the order to THAT exchange —
//      the directive rides into the model ahead of the visitor's
//      own turn, shaping the answer itself to finish with the
//      send-offer. The post-turn persistence below stays as the
//      second chance, unchanged. (The voice transport has no
//      equivalent hook — see the build report; voice sessions
//      keep the post-answer machinery exactly as #81 left it.)
//   2. COMPLETENESS — every offer that fired live dropped the
//      SHARE ANGLE (manager / colleague / owner appeared in 0
//      of 3 offers). An offer observed WITHOUT the angle now
//      earns ONE completion directive at that same boundary,
//      ordering the angle as a natural follow-up beat — never a
//      correction, never a repeat of the offer — capped at 1
//      per offer episode, and standing down the moment the
//      visitor responds to the offer.
//   3. SEQUENCE — (a) the S3 rerun bundled collection INTO the
//      offer turn ("…let me send you the link to this demo or a
//      recap. What's the best mobile number for that?"). A turn
//      carrying BOTH a send-offer and a collection ask, before
//      any visitor acceptance, is now a violation class of its
//      own — the BUNDLED offer: it does NOT discharge the
//      end-ask (this supersedes the #79/#81 ruling that an
//      offer-led same-turn ask counted as delivered; Ron's
//      scripted sequence, Publish #83 step 6, is offer → yes →
//      collect). Its correction is deferred to the visitor's
//      response: dictation counts as acceptance and the ritual
//      proceeds untouched; a verbal yes makes the collection
//      that follows legitimate; any other answer — or a later
//      speechless boundary — earns ONE clean re-put of the
//      offer, standing alone. (b) In the same run a meeting
//      offer pivoted in during a SILENCE window while the
//      send-offer stood unanswered: the gate now tracks the
//      offer as OUTSTANDING from the turn that makes it until
//      the visitor responds, and the proxy's silence-ladder
//      composition for sales sessions holds on the outstanding
//      offer (salesSilenceHoldText) — a nudge may reference the
//      offer, never pivot to the meeting or any new step.
//      A corollary of the offer → yes → collect sequence: the
//      end-ask ORDER itself (both variants) now orders the
//      offer standing alone — the destination ask belongs
//      after the visitor's yes, inside the ritual.

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
  // Publish #84: the scripted step-6 phrasing family — "let me
  // send you something useful, like the link to this demo or a
  // recap of our conversation" (the #83 verification's S3 run 1,
  // verbatim) names the send item a clause later, and no pattern
  // above saw it: the offer existed live but was invisible to
  // the gate, so no completion could ever fire on it.
  /send you\b[^.?!]{0,120}\b(link|copy|recap|transcript|follow-?up)\b/i,
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

const SHARE_ANGLE_PATTERNS: RegExp[] = [
  /pass (it|this|that|them) (along |over |on )?to\b/i,
  /share (it|this|that|them) with\b/i,
  /show (it|this|that|them) to\b/i,
  /\b(manager|colleague|colleagues|owner|boss|partner)\b/i,
];

/**
 * Does this turn carry the SHARE ANGLE — the manager / colleague
 * / owner framing that makes the send-offer the FRAMED end-ask
 * rather than a generic "let me send you the link" (Publish #84:
 * it fired in 0 of 3 live offers, so it is now detected on its
 * own). Only ever consulted on a turn that already makes a
 * send-offer, where a role word is the angle in substance.
 */
export function turnHasShareAngle(text: string): boolean {
  const t = text || '';
  return SHARE_ANGLE_PATTERNS.some((p) => p.test(t));
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
 * Did the visitor ACCEPT an outstanding send-offer (Publish
 * #84)? Judged only while an offer stands unanswered: a yes, a
 * "go ahead", a channel pick ("email is best") — the acceptance
 * that moves the scripted sequence from the offer to the
 * collection. A decline shape is never an acceptance (the
 * decline fold runs first regardless; this detector refuses
 * them too, belt and braces).
 */
export function detectOfferAcceptance(text: string): boolean {
  const t = text || '';
  if (detectAskDecline(t)) return false;
  return /\b(yes|yeah|yep|sure|okay|go ahead|please do|send it|that works|sounds good|email is best|e-?mail is best|text is best|text me|e-?mail me)\b/i.test(t);
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
  /** A send-offer has been made and the visitor has not yet
   * responded to it (Publish #84): while it stands, the
   * silence ladder holds on it and the end-ask order stands
   * down — the offer is in front of the visitor, and the next
   * beat is theirs. Cleared by the fold that resolves it
   * (acceptance, decline, dictation, or any other answer). */
  offerOutstanding: boolean;
  /** The outstanding offer was BUNDLED — it carried a
   * collection ask before any acceptance (Publish #84's
   * violation class). Stays set across speechless boundaries
   * until the visitor's response resolves it or the re-put
   * correction fires. */
  offerBundled: boolean;
  /** The outstanding offer was observed WITHOUT the share
   * angle (Publish #84): the re-put correction, if one is
   * owed, must carry the angle; read at fire time via the
   * bundledAngleMissing snapshot below. */
  offerAngleMissing: boolean;
  /** The visitor accepted the outstanding offer (Publish #84):
   * the collection that follows is the ritual's first step —
   * legitimate, not a queue-jump. Cleared when that collection
   * lands (the end-ask is delivered) or when a later decline
   * withdraws the acceptance. */
  offerAccepted: boolean;
  /** Share-angle completions injected in the CURRENT offer
   * episode (Publish #84: cap 1 — reset each time a new offer
   * becomes outstanding after the previous one resolved). */
  angleCompletionFires: number;
  /** Bundled-offer re-put corrections injected (Publish #84:
   * cap 2, like the other correction families). */
  bundledCorrections: number;
  /** A bundled offer was resolved by the visitor answering
   * something else, and its clean re-put is owed at this
   * boundary (Publish #84). A state field, not a local, because
   * the fold can land in the pre-answer decision while the
   * correction is the turn decision's to fire — and a blocked
   * boundary must not lose the debt. */
  bundledReputOwed: boolean;
  /** The share-angle state of the bundled offer at the moment
   * its re-put correction fired — the proxy picks the re-put
   * directive's completeness from it (the endAskRepeat
   * pattern: a fire-time snapshot the decision does not
   * clear). */
  bundledAngleMissing: boolean;
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
  offerOutstanding: false,
  offerBundled: false,
  offerAngleMissing: false,
  offerAccepted: false,
  angleCompletionFires: 0,
  bundledCorrections: 0,
  bundledReputOwed: false,
  bundledAngleMissing: false,
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
  // Publish #84: the order now orders the offer STANDING ALONE.
  // The pre-#84 text ordered the destination ask in the same
  // turn ("Ask for the email address or the mobile number that
  // send should go to") — the exact bundling the bundled-offer
  // class now corrects, and the opposite of the scripted
  // sequence (Publish #83 step 6: offer → yes → collect). The
  // gate cannot order a shape its own decision then flags.
  if (repeat) {
    return `The framed send-offer is STILL owed — it has not been made, and it comes BEFORE anything else is collected: before a meeting is booked, and before any name or email is taken to schedule one. Make it now, leading your next turn, exactly once, as an offer standing on its own: ${END_ASK_FRAMING}. Make the offer ONLY — do not bundle the ask for the email address or the mobile number into it: first the offer, then their answer, and only if they say yes do you collect the detail it should go to, through the normal capture ritual — read it back, spell the email, confirm the number, and ask the texting permission before any text is promised. Only after that offer is made and answered may the booking conversation continue — the meeting offer may follow the send-offer, but it never replaces it and never goes first. If they decline or wave it off, accept it in one warm line and NEVER ask again in this session.`;
  }
  return `The visitor has shown interest, and the one capture ask of this sales conversation is now earned — make it in your next turn, at the next natural pause, as a SEND offer standing on its own, exactly once: ${END_ASK_FRAMING}. Make the offer ONLY — do not ask for the email address or the mobile number in the same turn: first the offer, then their answer, and only if they say yes do you collect the detail it should go to, through the normal capture ritual — read it back, spell the email, confirm the number, and ask the texting permission before any text is promised. If they decline or wave it off, accept it in one warm line and NEVER ask again in this session. Do not stack the offer on top of an unfinished answer: finish the thought you owe them first, then make the offer as its own beat.`;
}

/**
 * The PRE-ARM order (Publish #84): fired by
 * salesGatePreAnswerDecision at the moment a fresh interest
 * signal arrives, and carried into the model AHEAD of the
 * visitor's own turn on the text transport — so the interest
 * ANSWER itself, not some later turn, is shaped to finish
 * with the send-offer standing alone as its final beat.
 */
export function endAskPreArmDirective(): string {
  return `The visitor's message — the one you are about to answer — shows clear interest: they are asking about the price, or how to get started. Answer their question IN FULL first: the price, the setup, whatever they actually asked. Then, as the finishing beat of THIS SAME answer — before any meeting offer and before collecting anything — make the one framed send-offer of this conversation, standing on its own: ${END_ASK_FRAMING}. Make the offer ONLY in this answer: do NOT ask for their email address or mobile number yet — first the offer, then their answer, and only if they say yes do you collect the detail it should go to, through the normal capture ritual (read it back, spell the email, confirm the number, ask the texting permission before any text is promised). Do not let a meeting offer or a booking step into this answer ahead of the send-offer: the meeting may only follow once the send-offer has been made and answered. If they decline or wave the offer off, accept it in one warm line and NEVER ask again in this session.`;
}

/**
 * The share-angle completion (Publish #84): the send-offer
 * landed WITHOUT the share angle. One directive, fired at the
 * boundary that observed the offer, ordering the angle as a
 * natural follow-up beat — not a correction, not a repeat of
 * the offer, and never a bundled collection.
 */
export function shareAngleCompletionDirective(): string {
  return `Your send-offer just landed, but it was missing the share angle — the part that makes it easy to pass along: that this is something they can pass to their manager, a colleague, or the owner. Before anything else in your next turn — before any meeting talk, any new point, any detail — add that one line, naturally, as a follow-up beat on the offer you just made, in your own words (for example: "…and feel free to pass it along to your manager, a colleague, or the owner, if they'd want a look."). Do NOT repeat the offer itself, and do NOT ask for an email address or a mobile number in this turn — the offer stands exactly as made; you are only completing it. Then let them answer it.`;
}

/**
 * The bundled-offer correction (Publish #84): the model's
 * offer carried its collection ask in the same turn, before
 * the visitor could accept. The correction orders ONE clean
 * re-put of the offer, standing alone — shaped for the next
 * offer as much as for this one — and pre-answers the two
 * continuations: a visitor who answers the bundled collection
 * anyway has accepted (the ritual proceeds, no scolding, no
 * walk-back), and a visitor who moved on is answered on their
 * own point with the re-put resting as the last word.
 * `angleMissing` carries the observed offer's completeness:
 * the re-put includes the share angle when the bundled offer
 * dropped it.
 */
export function bundledOfferDirective(angleMissing: boolean): string {
  const angleBeat = angleMissing
    ? ` The offer you bundled also dropped the share angle, so the clean re-put carries it in full: ${END_ASK_FRAMING}.`
    : ` Re-put it with its full framing: ${END_ASK_FRAMING}.`;
  return `You bundled the ask for their contact detail INTO the send-offer itself — collecting before the visitor had accepted anything. The offer must stand alone: first the offer, then their yes, and only then the details. Re-put the offer cleanly now, briefly, as its own beat, and ask for NO email address, name, or phone number in this turn.${angleBeat} If they answer by giving the details anyway, that is a yes — take them gladly through the normal capture ritual (read it back, spell the email, confirm the number, ask the texting permission before any text is promised), with no apology and no walk-back. If they have moved on to something else, the re-put rests as the last word on the offer — do not chase it, and do not bundle a collection into any future offer either.`;
}

/**
 * Silence-ladder texts for sales sessions while a send-offer
 * stands OUTSTANDING (Publish #84): composed by the proxy at
 * the idle_prompt point in place of the ladder's normal sales
 * texts. A nudge may reference the outstanding offer — it
 * never pivots to the meeting, never continues the pitch,
 * never starts a new step, and never asks for a detail.
 */
export function salesSilenceHoldText(stage: string): string {
  switch (stage) {
    case 'bridge':
      return `The visitor has stayed silent through your check-in as well, and your send-offer is still unanswered. Hold on the offer: do NOT continue the pitch, do NOT surface the price or a statistic, do NOT offer a meeting, do not start any new step, and do not ask for any contact detail. One short line only, in substance: the offer to send the demo link or a copy of this conversation stands whenever they'd like it — then wait.`;
    case 'continue':
      return `The caller has been quiet for a short pause, and your send-offer is still unanswered. Hold on the offer: do not continue to the next service area, do not offer a meeting, do not start any new step, and do not ask for any contact detail. One short line only, in substance: you're here, and the offer to send the demo link or a copy of this conversation stands — then wait.`;
    case 'goodbye':
      return `The visitor has stayed silent and your send-offer was never answered. Close warmly in one or two short lines: thank them for their time, let them know the offer to send the demo link or a copy of this conversation stands if they'd like it later, and say goodbye. Do not offer a meeting, do not ask for any contact detail, and do not start anything new.`;
    default: // 'checkin' and any future first-rung stage
      return `The visitor has gone quiet with your send-offer still unanswered — the offer to send them the link to this demo or a copy of this conversation. Hold on that offer: do NOT move on to a meeting, a new topic, or any new step, and do not ask for any contact detail. Briefly check in on the offer itself, in substance: you're still here, and you're happy to send that over whenever they say the word. One short line, then wait.`;
  }
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
// The visitor fold (shared by both decisions)
// ---------------------------------------------------------------------------

/**
 * Fold one completed visitor utterance into the ledger: dictated
 * contact (the gate stands down for good), the interest signal
 * and its episode re-arm, the close signal, and — Publish #84 —
 * the resolution of an OUTSTANDING send-offer, whose meaning is
 * set by the offer standing in front of the visitor when they
 * spoke. The fold is IDEMPOTENT by design: on the text
 * transport the same utterance is folded twice (once by the
 * pre-answer decision when it arrives, once here at the
 * answering turn's turnComplete, from the provider's
 * transcription of it), and every branch settles the same way
 * the second time — interest already seen, the offer already
 * resolved, dictation already volunteered.
 *
 * Returns the transition flags the pre-answer decision needs:
 * whether THIS utterance newly showed interest (the false→true
 * transition) or re-armed an exhausted episode.
 */
function foldSalesVisitorUtterance(
  state: SalesGateState,
  visitorUtterance: string,
): { state: SalesGateState; interestTransitioned: boolean; episodeRearmed: boolean } {
  let out = state;
  let interestTransitioned = false;
  let episodeRearmed = false;
  if (!visitorUtterance) return { state: out, interestTransitioned, episodeRearmed };
  const dictated = detectDictatedContact(visitorUtterance);
  if (dictated.email || dictated.phone) out = { ...out, volunteered: true };
  if (detectInterestSignal(visitorUtterance)) {
    if (!out.interestSeen) {
      out = { ...out, interestSeen: true };
      interestTransitioned = true;
    } else if (
      // Publish #81: a FRESH interest signal after the current
      // episode's orders ran out re-arms the debt — a new
      // episode with its own two fires, still bounded by the
      // session total. Interest alone, with fires remaining,
      // changes nothing: the outstanding order simply persists.
      out.endAskFires >= 2
      && out.endAskTotalFires < SALES_GATE_END_ASK_TOTAL_FIRES
      && !out.askDelivered && !out.askDeclined
    ) {
      out = { ...out, endAskFires: 0, endAskRepeat: false };
      episodeRearmed = true;
    }
  }
  if (!out.closeSeen && detectCloseSignal(visitorUtterance)) {
    out = { ...out, closeSeen: true };
  }
  // Publish #84: an outstanding send-offer is RESOLVED by the
  // visitor's response to it — judged before the generic
  // decline fold below, because the same words mean different
  // things with an offer standing in front of them.
  if (out.offerOutstanding) {
    if (dictated.email || dictated.phone) {
      // They answered the (bundled) collection anyway: that IS
      // acceptance — the volunteered stand-down above owns the
      // rest, and the ritual proceeds with no walk-back.
      out = { ...out, offerOutstanding: false, offerBundled: false, offerAngleMissing: false };
    } else if (detectAskDecline(visitorUtterance)) {
      // Declining the OFFER — ask-less or bundled — spends the
      // one ask: the offer IS the ask in substance (Publish
      // #83's step 6: after a decline the offer is never
      // repeated). Setting askFired here is what lets the
      // generic machinery below and the no-repeat rule see the
      // spend even when the gate never ordered an ask.
      out = { ...out, offerOutstanding: false, offerBundled: false, offerAngleMissing: false, askFired: true, askDeclined: true };
    } else if (detectOfferAcceptance(visitorUtterance)) {
      // Accepted: the collection that follows is the ritual's
      // first step, legitimate by construction.
      out = { ...out, offerOutstanding: false, offerBundled: false, offerAngleMissing: false, offerAccepted: true };
    } else {
      // Answered something else — the offer was passed over.
      // A BUNDLED offer earns its clean re-put at this
      // boundary; a clean one simply resolves. The re-put's
      // angle snapshot is taken HERE, before the resolution
      // clears the offer's own angle bookkeeping.
      out = {
        ...out,
        offerOutstanding: false,
        offerBundled: false,
        offerAngleMissing: false,
        ...(out.offerBundled ? { bundledReputOwed: true, bundledAngleMissing: out.offerAngleMissing } : {}),
      };
    }
  } else if (out.offerAccepted && detectAskDecline(visitorUtterance)) {
    // Accepted an offer, then withdrew before any collection
    // landed: the acceptance lapses and the question closes.
    out = { ...out, offerAccepted: false, askFired: true, askDeclined: true };
  }
  if (out.askFired && !out.askDeclined && detectAskDecline(visitorUtterance)) {
    out = { ...out, askDeclined: true };
  }
  return { state: out, interestTransitioned, episodeRearmed };
}

// ---------------------------------------------------------------------------
// The pre-answer decision (Publish #84)
// ---------------------------------------------------------------------------

export type SalesGatePreArmInjection = 'end-ask-prearm' | null;

/**
 * The PRE-ANSWER decision (Publish #84): evaluated by the proxy
 * at the moment a visitor utterance ARRIVES, before the model
 * composes its answer — on the text transport, where the proxy
 * holds the visitor's full utterance before forwarding it (the
 * build report documents why the audio transport has no
 * equivalent hook). The utterance is folded exactly as the
 * turn-boundary decision will fold it again at turnComplete
 * (the fold is idempotent), and when the utterance newly shows
 * interest — the false→true transition, or a fresh signal that
 * re-arms an exhausted episode — while the end-ask stands owed
 * and unobstructed, the decision spends ONE end-ask order
 * (same episode and session caps, same awaiting-delivery
 * bookkeeping) and the proxy attaches its directive to the
 * exchange ahead of the visitor's own turn: the interest
 * ANSWER itself is shaped to finish with the send-offer
 * standing alone. The post-turn persistence in
 * salesGateTurnDecision remains the second chance when the
 * shaped answer still does not land the offer.
 */
export function salesGatePreAnswerDecision(input: {
  state: SalesGateState;
  contact: { email?: string | null; phone?: string | null } | null | undefined;
  visitorUtterance: string;
  blocked: boolean;
}): { state: SalesGateState; inject: SalesGatePreArmInjection } {
  let state = input.state;
  // The durable store outranks every fold, exactly as at the
  // turn boundary.
  if (!state.contactHeld && input.contact && (input.contact.email || input.contact.phone)) {
    state = { ...state, contactHeld: true };
  }
  const folded = foldSalesVisitorUtterance(state, input.visitorUtterance);
  state = folded.state;
  if (state.volunteered || state.contactHeld || input.blocked) return { state, inject: null };
  if (state.fires >= SALES_GATE_MAX_FIRES) return { state, inject: null };
  // Only a FRESH interest signal pre-arms: the interest turn
  // itself, or the signal that re-arms a spent episode. An
  // utterance that merely continues an exchange the machinery
  // is already working adds no second order on top of it.
  if (!folded.interestTransitioned && !folded.episodeRearmed) return { state, inject: null };
  // The end-ask must stand owed and unobstructed: not
  // delivered, not declined, no offer already in front of the
  // visitor, no acceptance already in hand.
  if (state.askDelivered || state.askDeclined || state.offerOutstanding || state.offerAccepted) {
    return { state, inject: null };
  }
  if (state.endAskFires >= 2 || state.endAskTotalFires >= SALES_GATE_END_ASK_TOTAL_FIRES) {
    return { state, inject: null };
  }
  const repeat = state.endAskFires >= 1;
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
    inject: 'end-ask-prearm',
  };
}

// ---------------------------------------------------------------------------
// The turn-boundary decision
// ---------------------------------------------------------------------------

export type SalesGateInjection = 'early-ask' | 'end-ask' | 'no-repeat' | 'share-angle' | 'bundled-offer' | null;

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
  state = foldSalesVisitorUtterance(state, visitorUtterance).state;
  // A bundled offer carried INTO this boundary, still unresolved
  // after the fold: its re-put may be earned here even with no
  // fresh visitor speech (a silence-nudge turn completing is a
  // boundary too). Captured before the observe below, which is
  // where a bundled offer made by THIS turn is first recorded —
  // a turn never earns its own correction at its own boundary.
  const bundledCarriedIn = state.offerBundled && state.offerOutstanding;

  // ---- OBSERVE the model turn that just completed ---------------------
  // Publish #81: the turn's capture ask is CLASSIFIED, not just
  // detected. Publish #84: the turn's SEND-OFFER is observed
  // independently of its ask — a pure offer (no ask) makes the
  // offer OUTSTANDING, and an offer carrying a collection ask
  // before any acceptance is the BUNDLED class, which no longer
  // discharges the end-ask the way #79/#81 ruled a framed ask
  // did: the scripted sequence is offer → yes → collect.
  const askKind = classifyModelAsk(modelTurnText);
  const asked = askKind !== 'none';
  const sendOffer = turnMakesSendOffer(modelTurnText);
  const modelClose = turnBeginsClose(modelTurnText);
  const wasAwaitingDelivery = state.awaitingDelivery;
  let repeatCandidate = false;
  let earlyCandidate = false;
  let violationCandidate = false;
  let angleCompletionCandidate = false;
  if (state.awaitingDelivery) state = { ...state, awaitingDelivery: false };
  if (asked) {
    if (state.askDeclined) {
      // ANY capture ask after the visitor declined the one ask —
      // bare, framed or booking-form — is a repeat.
      repeatCandidate = true;
    } else if (state.offerAccepted) {
      // Publish #84: the visitor accepted the outstanding
      // offer, and this collection — bare, framed or booking —
      // is the ritual's first step: the end-ask's purpose is
      // fulfilled, the debt discharged. (offerAccepted is only
      // ever set while the end-ask is undelivered.)
      state = { ...state, askFired: true, askDelivered: true, offerAccepted: false };
    } else if (state.askDelivered) {
      if (askKind === 'booking') {
        // The end-ask was made; the booking flow collecting its
        // scheduling details afterwards is legitimate and
        // proceeds unimpeded — not a repeat, not a violation.
      } else {
        repeatCandidate = true;
      }
    } else if (sendOffer) {
      // Publish #84 — THE BUNDLED OFFER: a send-offer and a
      // collection ask in the SAME turn, before any acceptance
      // (the 'framed' shape, and the collection-led 'booking'
      // shape with the offer trailing, alike). The offer is
      // recorded as outstanding and bundled; the end-ask is
      // NOT discharged and the sterner violation order does NOT
      // answer it — the visitor's response resolves it (the
      // fold), and only an unresolved bundled offer earns the
      // re-put correction. With no interest, close, or order
      // behind it, the same shape in qualification is an early
      // ask, exactly as a framed ask was under #79.
      if (state.interestSeen || state.closeSeen || modelClose || wasAwaitingDelivery) {
        const newEpisode = !state.offerOutstanding;
        state = {
          ...state,
          offerOutstanding: true,
          offerBundled: true,
          offerAngleMissing: !turnHasShareAngle(modelTurnText),
          ...(newEpisode ? { angleCompletionFires: 0 } : {}),
        };
      } else {
        earlyCandidate = true;
      }
    } else if (askKind === 'booking') {
      if (state.interestSeen) {
        // Collection jumped the queue: the framed send-offer is
        // owed and unmade, and the booking form collected first.
        violationCandidate = true;
      } else {
        earlyCandidate = true;
      }
    } else {
      // A bare, unframed ask.
      if (state.interestSeen) {
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
  } else if (sendOffer && !state.askDeclined) {
    // Publish #84 — A PURE SEND-OFFER: the offer standing
    // alone, as scripted. It becomes the OUTSTANDING offer:
    // the destination ask is owed only after the visitor
    // accepts, and while it stands the end-ask order and the
    // silence ladder both hold on it. An offer observed
    // WITHOUT the share angle earns the one completion.
    const newEpisode = !state.offerOutstanding;
    state = {
      ...state,
      offerOutstanding: true,
      offerBundled: false,
      offerAngleMissing: !turnHasShareAngle(modelTurnText),
      ...(newEpisode ? { angleCompletionFires: 0 } : {}),
    };
    if (state.offerAngleMissing) angleCompletionCandidate = true;
  }

  // The bundled re-put is owed at this boundary when the fold
  // resolved a bundled offer with an other-answer, or when a
  // bundled offer carried in is STILL bundled after this
  // turn's observe (the visitor never spoke — a silence-nudge
  // turn completed — and this turn did not itself re-put the
  // offer cleanly, which would have cleared the flag above).
  const bundledCorrectionCandidate = state.bundledReputOwed
    || (bundledCarriedIn && state.offerBundled);

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
  // 3. BUNDLED-OFFER CORRECTION (Publish #84) — a bundled offer
  //    was resolved without acceptance, or stands unresolved
  //    past a speechless boundary: ONE clean re-put of the
  //    offer, standing alone. The fire-time snapshot
  //    (bundledAngleMissing) tells the proxy whether the re-put
  //    must also carry the share angle the bundled offer
  //    dropped.
  if (bundledCorrectionCandidate && state.bundledCorrections < 2) {
    return {
      state: {
        ...state,
        offerBundled: false,
        bundledReputOwed: false,
        // The angle snapshot: taken by the fold when an
        // other-answer resolved the offer (bundledReputOwed);
        // for a speechless boundary the offer's own bookkeeping
        // still holds it (offerAngleMissing).
        bundledAngleMissing: state.bundledReputOwed ? state.bundledAngleMissing : state.offerAngleMissing,
        bundledCorrections: state.bundledCorrections + 1,
        fires: state.fires + 1,
      },
      inject: 'bundled-offer',
    };
  }
  // 4. SHARE-ANGLE COMPLETION (Publish #84) — the offer that
  //    just landed dropped the share angle: ONE completion
  //    directive orders it as a follow-up beat, while the
  //    offer still stands unanswered (a visitor response
  //    folded at this boundary resolved the offer in the fold
  //    above, and no candidate survives that). Ahead of the
  //    end-ask order: the completion is the precise instrument
  //    for this state, and the order's persistence remains the
  //    backstop if the destination ask still has not landed
  //    once the offer is answered.
  if (angleCompletionCandidate && state.angleCompletionFires < 1) {
    return {
      state: { ...state, angleCompletionFires: state.angleCompletionFires + 1, fires: state.fires + 1 },
      inject: 'share-angle',
    };
  }
  // 5. THE END-ASK — owed while interest stands behind it and the
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
  //    no interest signal, no ask at all). Publish #84: the
  //    order also stands down while a send-offer is OUTSTANDING
  //    — the offer is in front of the visitor, and ordering the
  //    ask over it would collapse offer → yes → collect into
  //    offer → collect.
  if (!state.askDelivered && !state.askDeclined && state.interestSeen
    && !state.offerOutstanding
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
