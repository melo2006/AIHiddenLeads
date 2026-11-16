// Publish #86 — the BOOKING GATE (2026-11-16).
//
// Ron's D4-on-VPS test (session 22b47dfa, 2026-11-16) proved the
// failure this gate exists to kill: the session config carried
// platformFollowup=true and homepageSales=true — byte-identical to
// the working transfer session — so Aspen HELD every platform
// booking tool (platform_availability, get_availability, check_time,
// book_call, request_platform_appointment) plus the PLATFORM BOOKING
// POLICY in her prompt ("Use platform_availability before discussing
// real openings") for all 179 turns, and never called one. She
// promised the visitor a callback at 15:30, then 15:00, out of thin
// air: no calendar check, no booking, no confirmation — nothing was
// ever booked.
//
// This is the same transition failure the sales gate (#79–#84)
// closed for the end-ask: a spoken rule loses at the moment of
// commitment, so the enforcement is MECHANICAL. The proxy keeps the
// booking ledger (has the calendar been checked? has a booking
// completed or a card been presented? did the visitor ask to book?)
// and, at a turn boundary, injects ONE directive when the model:
//   - commits to a specific time with no calendar check behind it
//     ('commitment'), or
//   - lets a visitor's booking intent sit un-acted-on — no check,
//     no booking, conversation drifting on ('intent'), or
//   - hears the visitor accept a slot after a check but still does
//     not complete the booking ('complete'), or
//   - holds the visitor's confirmed contact details with a booking
//     intent outstanding but never starts the confirmation-card
//     chain — the only route to a completed booking, since book_call
//     itself needs the card-confirmed contact ('advance'; harness
//     session ebe6ca96 stalled exactly here).
// Directives never stack with the capture/sales/consent gates: the
// proxy passes `blocked` when any of them already injected at the
// same boundary, and the debt survives to the next boundary.
//
// Scope: the proxy arms this gate on exactly the sessions that hold
// the platform booking tools minus simulations —
// config.platformFollowup === true && config.simulation !== true
// (preview is handled through `blocked`, like the sales gate).

/** Total booking-gate directives per session (mirrors the sales
 * gate's SALES_GATE_MAX_FIRES discipline). */
export const BOOKING_GATE_MAX_FIRES = 5;

const COMMITMENT_FIRES_CAP = 3;
const INTENT_FIRES_CAP = 3;
const COMPLETE_FIRES_CAP = 2;
const ADVANCE_FIRES_CAP = 3;

export interface BookingGateState {
  /** The visitor asked to book / agreed to a callback or meeting
   * and the thread has not been resolved by a check or a booking. */
  intentArmed: boolean;
  /** Turn boundaries seen since the intent armed with no calendar
   * check — the drift counter behind the sterner repeat. */
  armedTurns: number;
  /** 'commitment' corrections injected. */
  commitmentFires: number;
  /** 'intent' orders injected. */
  intentFires: number;
  /** 'complete' orders injected. */
  completeFires: number;
  /** 'advance' orders injected (contact held, no card on screen —
   * the B1 stall: the card chain never started). */
  advanceFires: number;
  /** Total directives injected this session. */
  fires: number;
}

export const freshBookingGateState = (): BookingGateState => ({
  intentArmed: false,
  armedTurns: 0,
  commitmentFires: 0,
  intentFires: 0,
  completeFires: 0,
  advanceFires: 0,
  fires: 0,
});

const TIME_MENTION =
  /\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b\d{1,2}\s?(?:a\.?m\.?|p\.?m\.?)\b|\bat\s+(?:[01]?\d|2[0-3])\b|\bàs\s+\d{1,2}(?:h|:|\b)|\ba las\s+\d{1,2}\b|\b\d{1,2}\s?h(?:oras)?\b/i;

const STRONG_COMMITMENT =
  /\byou(?:'re| are) booked\b|\bi(?:'ve| have) (?:booked|scheduled)\b|\bi scheduled\b|\byour (?:appointment|call|meeting) is (?:set|scheduled|booked|confirmed)\b|\bi(?:'ll| will) call you (?:back )?at\b|\bwe(?:'ll| will) call you (?:back )?at\b|\bcall you back at\b|\b(?:scheduled|booked) for (?:today|tomorrow|this|next|monday|tuesday|wednesday|thursday|friday|\d)/i;

const PT_ES_COMMITMENT =
  /\bagendei\b|\bestá agendado\b|\bficou agendado\b|\bestá marcado\b|\bficou marcado\b|\bvou (?:te |lhe )?ligar\b|\bte ligo\b|\bligarei\b|\bretorno (?:às|as)\b|\bte retorno\b|\bagendado para\b|\bmarcado para\b|\bquedó agendad|\bestá agendado\b|\bte llamo a las\b|\ble llamo a las\b|\bagendé\b/i;

const COMMITMENT_VERB =
  /\b(?:schedule|book|confirm|call you|call back|agendar|marcar|ligar|retornar|confirmar|llamar|programar)\b/i;

const FUTURE_ANCHOR =
  /\b(?:today|tomorrow|tonight|this (?:morning|afternoon|evening)|monday|tuesday|wednesday|thursday|friday|hoje|amanhã|esta (?:manhã|tarde|noite)|segunda|terça|quarta|quinta|sexta|hoy|mañana|esta (?:mañana|tarde)|lunes|martes|miércoles|jueves|viernes)\b/i;

/**
 * The model SPOKE a booking commitment: a confirmation that a call /
 * appointment exists at a specific time. Strong commitment phrases
 * count on their own; otherwise a clock time together with a
 * commitment verb and a future anchor counts. Offers of real slots
 * AFTER a calendar check are judged compliant by the caller (the
 * `calendarChecked` input), never by this classifier.
 */
export function turnCommitsToTime(text: string): boolean {
  const t = String(text || '');
  if (!t) return false;
  if (STRONG_COMMITMENT.test(t) || PT_ES_COMMITMENT.test(t)) return true;
  return TIME_MENTION.test(t) && COMMITMENT_VERB.test(t) && FUTURE_ANCHOR.test(t);
}

const BOOKING_INTENT =
  /\b(?:book|schedule|set up|arrange)\b[^.!?]{0,40}\b(?:call|appointment|meeting|demo|consultation)\b|\bcall me\b|\bcall back\b|\bcallback\b|\bbook it\b|\bschedule it\b|\bbook (?:me|us)\b/i;

const PT_ES_INTENT =
  /\bagendar\b|\bmarcar\b|\bme liga\b|\bpode (?:me )?ligar\b|\bme retorna\b|\bligação de retorno\b|\bpode ser (?:às|amanhã|hoje)\b|\bprogramar\b|\bllámame\b|\bllamame\b|\bdevuélveme la llamada\b/i;

/** The visitor asked to book, or agreed to a callback / meeting. */
export function detectBookingIntent(text: string): boolean {
  const t = String(text || '');
  if (!t) return false;
  if (BOOKING_INTENT.test(t) || PT_ES_INTENT.test(t)) return true;
  // The visitor naming a day + time in reply to a booking offer is
  // intent even without a booking verb ("tomorrow at 3 is fine",
  // "amanhã às 15 está bom").
  return TIME_MENTION.test(t) && FUTURE_ANCHOR.test(t);
}

const ACCEPTANCE =
  /\b(?:yes|yeah|yep|sure|ok(?:ay)?|perfect|sounds good|that works|works for me|sim|claro|pode ser|combinado|perfeito|está bom|ta bom|sí|vale|de acuerdo|perfecto)\b/i;

const SLOT_REFERENCE =
  /\b(?:that (?:time|one|slot)|that works|esse hor[aá]rio|nesse hor[aá]rio|ese horario|esa hora)\b/i;

/** The visitor accepted a specific offered slot. */
export function detectSlotAcceptance(text: string): boolean {
  const t = String(text || '');
  if (!t) return false;
  return ACCEPTANCE.test(t) && (TIME_MENTION.test(t) || SLOT_REFERENCE.test(t));
}

export function commitmentDirective(stern: boolean): string {
  return stern
    ? 'BOOKING GATE — FINAL ORDER. You named or confirmed an appointment time AGAIN without checking the real calendar. No booking exists, and inventing times is the one thing you must never do. In your next turn, FIRST call get_availability — or check_time if the visitor named an exact time — and offer ONLY the slots it returns. Then finish the chain in the same flow: call request_platform_followup to put the contact confirmation card on screen with the details the visitor confirmed; when they confirm it, call request_platform_appointment with the slot they picked (or book_call if they will not use the screen). Do not state any time that did not come from a tool result.'
    : 'BOOKING GATE — STOP. You just named or confirmed an appointment time without checking the real calendar, so no booking exists. In your next turn, FIRST call get_availability — or check_time if the visitor named an exact time — and offer ONLY the slots it returns. Then finish the chain: call request_platform_followup to put the contact confirmation card on screen with the details the visitor confirmed; when they confirm it, call request_platform_appointment with the slot they picked (or book_call if they will not use the screen). Never state a time that did not come from a tool result.';
}

export function intentDirective(stern: boolean): string {
  return stern
    ? 'BOOKING GATE — FINAL ORDER. The visitor asked to book and the booking STILL has not been acted on: no calendar check, no booking. Do it now, in your next turn: call get_availability (check_time if they named an exact time), offer only the returned slots, then put the confirmation card on screen with request_platform_followup and, once they confirm, request_platform_appointment with their slot (or book_call if they will not use the screen). Do not change the subject and do not say goodbye while a booking the visitor asked for is unfinished.'
    : 'BOOKING GATE: The visitor wants to book / agreed to a call. Do not discuss, offer or confirm ANY time from memory. In your next turn, call get_availability — or check_time if they named an exact time — offer only the slots it returns, then put the confirmation card on screen with request_platform_followup; when they confirm it, call request_platform_appointment with their slot (or book_call if they will not use the screen).';
}

export function completeDirective(): string {
  return 'BOOKING GATE: The visitor accepted that slot, but the booking is still not completed — accepting is not booking. In your next turn, complete it now: if their contact details are not yet confirmed on screen, call request_platform_followup first; then present the appointment card (request_platform_appointment) with that exact slot, or call book_call with it once the contact is confirmed. Confirm the booking to the visitor only after the tool or the card confirms it.';
}

export function advanceDirective(stern: boolean): string {
  return stern
    ? 'BOOKING GATE — FINAL ORDER. The visitor gave and confirmed their contact details and is waiting to be booked, and there is STILL no confirmation card on their screen. The booking cannot finish without it. In your next turn: if you have not checked the real calendar yet, call get_availability FIRST (check_time if they named an exact time); then call request_platform_followup NOW to put the contact confirmation card on screen. When the visitor confirms it, immediately call request_platform_appointment with the slot they picked. Do not say goodbye while this is unfinished.'
    : 'BOOKING GATE: The visitor has given and confirmed their contact details and wants the booking, but no confirmation card is on their screen — the booking cannot finish without it. In your next turn: if you have not checked the real calendar yet, call get_availability first (check_time if they named an exact time); then call request_platform_followup to put the contact confirmation card on screen with the details they confirmed. When they confirm it, immediately call request_platform_appointment with the slot they picked.';
}

export type BookingGateInjection = 'commitment' | 'intent' | 'complete' | 'advance' | null;

export interface BookingGateTurnInput {
  state: BookingGateState;
  /** The model's just-completed turn text. */
  modelTurnText: string;
  /** The visitor's just-completed utterance (may be ''). */
  visitorUtterance: string;
  /** A real calendar tool (platform_availability / get_availability
   * / check_time) has been called at any point this session. */
  calendarChecked: boolean;
  /** A booking has completed (book_call ok, or the appointment card
   * was confirmed). */
  bookingCompleted: boolean;
  /** The visit already holds a captured email AND phone (the durable
   * captured-contact store), so the confirmation card can be put on
   * screen immediately. */
  contactHeld: boolean;
  /** The appointment card has been presented and is in play. */
  cardPresented: boolean;
  /** Another gate already injected at this boundary, or the turn is
   * otherwise spoken for (preview, farewell, transfer, pending
   * card). The debt survives; only the injection stands down. */
  blocked: boolean;
}

export interface BookingGateTurnResult {
  state: BookingGateState;
  inject: BookingGateInjection;
  /** The fire was the sterner repeat variant. */
  stern: boolean;
}

export function bookingGateTurnDecision(input: BookingGateTurnInput): BookingGateTurnResult {
  const state: BookingGateState = { ...input.state };
  const done = input.bookingCompleted || input.cardPresented;

  // A completed booking or a live card resolves any armed thread,
  // permanently for this session's booking flow.
  if (done) {
    state.intentArmed = false;
    state.armedTurns = 0;
    return { state, inject: null, stern: false };
  }

  if (detectBookingIntent(input.visitorUtterance)) {
    state.intentArmed = true;
    state.armedTurns = 0;
  }

  const commits = turnCommitsToTime(input.modelTurnText);

  // 1) A spoken commitment with no calendar check behind it — the
  //    22b47dfa failure itself. Highest priority, fires even over an
  //    un-acted intent (it IS the intent gone wrong).
  if (commits && !input.calendarChecked) {
    state.intentArmed = true;
    if (
      !input.blocked &&
      state.commitmentFires < COMMITMENT_FIRES_CAP &&
      state.fires < BOOKING_GATE_MAX_FIRES
    ) {
      state.commitmentFires += 1;
      state.fires += 1;
      return { state, inject: 'commitment', stern: state.commitmentFires >= 2 };
    }
    return { state, inject: null, stern: false };
  }

  // 1b) The card-chain stall (harness session ebe6ca96, 2026-11-16):
  //     intent armed and the visitor's contact details are held and
  //     verbally confirmed, but no card was ever presented — every
  //     later turn went silent and nothing booked. The card chain is
  //     the only route to a completed booking (book_call itself needs
  //     the card-confirmed contact), so order it started.
  if (state.intentArmed && input.contactHeld) {
    if (
      !input.blocked &&
      state.advanceFires < ADVANCE_FIRES_CAP &&
      state.fires < BOOKING_GATE_MAX_FIRES
    ) {
      state.advanceFires += 1;
      state.fires += 1;
      return { state, inject: 'advance', stern: state.advanceFires >= 2 };
    }
    return { state, inject: null, stern: false };
  }

  // 2) After a real check, the visitor accepted a slot and the model
  //    still did not complete the booking.
  if (input.calendarChecked && detectSlotAcceptance(input.visitorUtterance)) {
    if (
      !input.blocked &&
      state.completeFires < COMPLETE_FIRES_CAP &&
      state.fires < BOOKING_GATE_MAX_FIRES
    ) {
      state.completeFires += 1;
      state.fires += 1;
      return { state, inject: 'complete', stern: false };
    }
    return { state, inject: null, stern: false };
  }

  // 3) An armed booking intent with no check yet: fire on the arming
  //    boundary, then once more, sterner, if the thread drifts.
  if (state.intentArmed && !input.calendarChecked) {
    state.armedTurns += 1;
    const due = state.armedTurns === 1 || state.armedTurns >= 3;
    if (
      due &&
      !input.blocked &&
      state.intentFires < INTENT_FIRES_CAP &&
      state.fires < BOOKING_GATE_MAX_FIRES
    ) {
      state.intentFires += 1;
      state.fires += 1;
      return { state, inject: 'intent', stern: state.intentFires >= 2 };
    }
  }

  return { state, inject: null, stern: false };
}
