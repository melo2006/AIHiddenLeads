// The texting-consent ASK, mechanically driven (Publish #70, 2026-11-15).
//
// THE DEFECT (live-verified in the Publish #68 harness sessions,
// ~/workspace/publish68-verification-2026-11-15.md): #68's CAPTURE
// RITUAL POLICY told the presenter to ask the texting question at the
// capture moment. When the visitor VOLUNTEERED consent it was recorded
// durably — but when the visitor merely confirmed their read-back, the
// presenter NEVER ASKED: it transitioned straight into the next topic,
// in a scripted session and in a supplementary control session alike.
// A policy sentence is not a mechanism, and this step carries legal
// weight (TCPA): an un-asked question means no consent, and consent
// invented or assumed would be worse. The ask must be DRIVEN.
//
// THE MECHANISM (three levers, one state machine — this module owns
// the state machine and the wording; gemini-live-proxy owns the
// wiring):
//
//  1. TOOL-RESPONSE DIRECTIVE. When record_captured_contact lands a
//     mobile number with the consent answer still unknown, its tool
//     response stops being a plain receipt: it orders the model's
//     VERY NEXT spoken turn to be the texting question
//     (recordContactToolResponse below).
//  2. TURN-BOUNDARY NUDGE. The proxy tracks the ask across model
//     turns (consentAskTurnDecision). If the model's next completed
//     turn did not contain the ask, the proxy injects a server-
//     authored clientContent turn that elicits the ask as the model's
//     next turn — the same injection channel the pacing and handoff-
//     return instructions use. If the ask WAS delivered but the
//     visitor's answer was never recorded, the nudge orders the
//     recording instead. Nudges are capped (CONSENT_ASK_MAX_NUDGES):
//     a session that somehow burns through them simply stays
//     un-consented — no text is ever sent without a recorded yes,
//     so the failure mode is a missed opt-in, never a violation.
//  3. COMPLETION GATING. The capture is not treated as complete
//     while the ask is owed: the state stays 'owed' across turns
//     until a boolean smsConsent lands in the durable store
//     (captured-contact.ts) from ANY capture path — the ritual
//     tool's second call, a book_call argument, a card payload —
//     and every resolution clears the debt at once.
//
// A spoken YES records smsConsent=true; a NO records false and is
// final — the store's tri-state semantics (#68) mean a resolved
// answer can never re-arm the ask, so it is never re-asked.

import type { CapturedContact } from './captured-contact.ts';

/** Total server nudges one session will spend on the ask. */
export const CONSENT_ASK_MAX_NUDGES = 3;

export interface ConsentAskState {
  /** A mobile is captured and the texting answer is still unknown. */
  owed: boolean;
  /** A model turn containing the texting question has been observed. */
  delivered: boolean;
  /** Server nudges injected so far this session. */
  nudges: number;
}

export const freshConsentAskState = (): ConsentAskState => ({ owed: false, delivered: false, nudges: 0 });

/**
 * The ask is owed exactly when the durable facts hold a mobile number
 * and no explicit texting answer: a boolean — either way — settles it
 * for the visit, and no number means there is nothing to text.
 */
export function consentAskOwedFor(contact: CapturedContact | null): boolean {
  return !!contact && contact.phone.trim() !== '' && typeof contact.smsConsent !== 'boolean';
}

/**
 * Arm (or settle) the ask from the current durable facts. Called at
 * every capture moment: a fresh capture with a number and no answer
 * arms it; any recorded answer — from any path — clears it, so the
 * ask can never fire over a consent that already exists.
 */
export function syncConsentAskState(state: ConsentAskState, contact: CapturedContact | null): ConsentAskState {
  if (!consentAskOwedFor(contact)) return state.owed ? { ...state, owed: false } : state;
  return state.owed ? state : { ...state, owed: true };
}

const TEXTING_WORD = /\b(text|texts|texting|sms)\b/i;
const ASK_OPENER = /\b(may we|can we|could we|may i|can i|is it (okay|ok|alright)|would you like|do you want|shall we|are you (okay|ok) with|okay to|ok to)\b/i;

/**
 * Did this model turn actually ASK the texting question? A statement
 * about texting ("we'll text you the details") is not an ask: the
 * turn must carry a texting word AND a question shape — a question
 * mark or an ask-opener ("May we…", "Is it okay…").
 */
export function turnContainsTextingAsk(text: string): boolean {
  if (!text || !TEXTING_WORD.test(text)) return false;
  return text.includes('?') || ASK_OPENER.test(text);
}

/**
 * The instruction carried by the record_captured_contact tool
 * response (alongside consentAskRequired: true) when the recorded
 * capture leaves the ask owed. The plain receipt it replaces stays
 * in the proxy for captures that settle — or never raise — the debt.
 */
export const CONSENT_ASK_TOOL_DIRECTIVE = 'A mobile number is recorded but texting consent has NOT been asked yet. Your VERY NEXT spoken turn — before any other topic, transition or question — must ask it, in role: "May we text you on this number?" Ask nothing else in that turn. When the visitor answers, call record_captured_contact again with smsConsent set to their answer (true for a yes, false for a no) to record it. Do not continue to any other subject until you have asked.';

/** Nudge injected when the model's last turn skipped the owed ask. */
export const CONSENT_ASK_NUDGE = 'You recorded the visitor\'s mobile number, but the texting-consent question has not been asked yet — and it must be asked before this conversation moves on. Ask it now, as your very next words, in role: "May we text you on this number?" Ask nothing else in this turn. When the visitor answers, record the answer at once with record_captured_contact (smsConsent true for a yes, false for a no) — a no is final and is never re-asked.';

/** Nudge injected when the ask was delivered but its answer was never recorded. */
export const CONSENT_RECORD_NUDGE = 'The visitor answered your texting question, but the answer has not been recorded. Record it now with record_captured_contact — smsConsent true if they said yes, false if they said no — before anything else. If their answer was genuinely unclear, ask the texting question once more instead.';

export type ConsentAskInjection = 'ask' | 'record' | null;

/**
 * The turn-boundary decision, evaluated by the proxy at each model
 * turnComplete. `modelTurnText` is the spoken text of the turn that
 * just completed; `visitorUtterance` is the visitor's completed
 * utterance that preceded it. `blocked` (a preview, or a farewell
 * that owns the close) suppresses every injection — the ask never
 * talks over a goodbye.
 */
export function consentAskTurnDecision(input: {
  state: ConsentAskState;
  contact: CapturedContact | null;
  modelTurnText: string;
  visitorUtterance: string;
  blocked: boolean;
}): { state: ConsentAskState; inject: ConsentAskInjection } {
  const { state, contact, modelTurnText, visitorUtterance, blocked } = input;
  if (!state.owed) return { state, inject: null };
  // A boolean answer recorded anywhere settles the debt silently.
  if (!consentAskOwedFor(contact)) return { state: { ...state, owed: false }, inject: null };
  if (blocked) return { state, inject: null };
  if (turnContainsTextingAsk(modelTurnText)) {
    // The ask landed in the turn that just completed. Nothing to
    // inject: the visitor's answer belongs to the NEXT turn, and if
    // it is not recorded there, the branch below catches it.
    return { state: state.delivered ? state : { ...state, delivered: true }, inject: null };
  }
  if (state.nudges >= CONSENT_ASK_MAX_NUDGES) return { state, inject: null };
  if (state.delivered && visitorUtterance.trim() !== '') {
    // The ask went out on an earlier turn, the visitor has since
    // spoken, and the store still holds no answer: the model took
    // the answer without recording it. Order the recording.
    return { state: { ...state, nudges: state.nudges + 1 }, inject: 'record' };
  }
  if (!state.delivered) {
    // The directive (and any earlier nudge) did not produce the ask.
    // Elicit it as the model's next turn.
    return { state: { ...state, nudges: state.nudges + 1 }, inject: 'ask' };
  }
  // Asked, and the visitor has not answered yet — wait quietly.
  return { state, inject: null };
}
