// Come-back after a browser handoff ends (Handoff improvement batch,
// 2026-11-12, Ron's design from his live test). The handoff machinery
// deliberately PAUSES the Gemini session while the Twilio browser leg
// runs and retains it for return — but the old return was a single
// outcome-blind client-authored line ("The human handoff has ended or
// was unavailable… Do not claim a manager answered") that fired
// identically after a completed manager call, a no-answer, a device
// error and the visitor's own Return tap, and rode the user-role
// `text` channel. Now the client reports only the terminal OUTCOME
// ({type:'handoff_ended', outcome}) and the proxy authors the return
// instruction here, injected as a server-side clientContent turn —
// the same channel the farewell and idle-prompt injections use, and
// deliberately distinct from the silence-recovery sequence (this
// fires on the handoff-end event itself, not after quiet time).

export type HandoffReturnOutcome = 'completed' | 'unavailable';

/** The client may only ever report these two outcomes; anything else
 *  (missing, mistyped, hostile) collapses to the honest one — a
 *  come-back must never claim a manager conversation that the
 *  terminal handoff status did not prove. 'completed' is reported
 *  only when the handoff row reached the terminal 'completed'
 *  status, or the visitor returned after the call had joined. */
export function handoffReturnOutcome(value: unknown): HandoffReturnOutcome {
  return value === 'completed' ? 'completed' : 'unavailable';
}

/**
 * The instruction the proxy injects so Aspen speaks the come-back.
 * - completed + sales: Ron's full flow — how was the call, what did
 *   you arrange, finish the demo / go through a workflow, then the
 *   wizard close (Alex + the setup wizard + the on-screen Start now
 *   button, which opens plan selection; the wizard itself runs after
 *   a plan is chosen — see _shared/alex-guide.ts).
 * - completed, non-sales (a tenant's own site / business roleplay):
 *   the same welcome-back and "what did you arrange" beat, kept in
 *   the business role, with no AI Hidden Leads sales close.
 * - unavailable: the honest line — no manager answered or the
 *   connection failed; never claim otherwise; offer a callback.
 */
export function handoffReturnInstruction(outcome: HandoffReturnOutcome, opts: { sales: boolean }): string {
  if (outcome === 'unavailable') {
    return 'The manager handoff did not connect — no manager answered, or the connection was unavailable; the visitor never spoke to a manager. Welcome the visitor back briefly and honestly, without claiming a manager answered. Apologize once for the wait, offer to take their name and number for a callback, and continue helping them.';
  }
  if (opts.sales) {
    return 'The visitor\'s call with the manager has ended, and they are back with you. Welcome them back warmly and ask how the call went. Then ask what they arranged with the manager, and whether there is anything from it you can help with right here. Ask whether they would like to complete their demo now, or go through a workflow. If they are ready to get started, make the wizard close, once, without pressure: it is easy to get started and takes only a few minutes — Alex, our support specialist, can walk them through the setup wizard right now; all they have to do is choose a plan, most people are done in about 15 minutes, and they can tap the Start now button on this page to begin. Then follow their lead.';
  }
  return 'The visitor\'s call with the manager has ended, and they are back with you. Welcome them back warmly and ask how the call went. Then ask what they arranged with the manager, and whether there is anything from it you can help with right here. Continue helping in your business role.';
}
