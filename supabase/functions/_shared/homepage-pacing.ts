// Homepage sales pacing: soft wrap-up around seven minutes, continue only while the caller stays engaged.
export const HOMEPAGE_WRAPUP_SECONDS = 420;
export const HOMEPAGE_REVIEW_SECONDS = 600;
export const ENGAGED_WINDOW_SECONDS = 90;

export function homepagePacingAction(elapsed: number, lastCallerSpeechAgo: number, wrapupSent: boolean) {
  if (elapsed >= HOMEPAGE_REVIEW_SECONDS && lastCallerSpeechAgo > ENGAGED_WINDOW_SECONDS) return 'close';
  if (!wrapupSent && elapsed >= HOMEPAGE_WRAPUP_SECONDS) return 'wrapup';
  return null;
}

// SESSION CEILING (2026-11-21, homepage-test item 8): the authorized
// max_seconds (900s for homepage-sales and lead/prospect sessions) used
// to be a HARD cut — the proxy's session timer closed the socket at
// exactly that mark, mid-word if necessary, with no wrap-up, while
// the pacing close above could end an engaged-feeling call at ~10
// minutes on a transcription-only signal. The ceiling is now a SOFT
// deadline owned by this state machine (driven from the proxy's
// pacing tick):
//   - at deadline − WRAPUP_LEAD: ONE wrap-up injection (finish the
//     current thought, offer the booking / demo / email next step);
//   - at deadline − WARNING_LEAD: the client is told to show a
//     visible "ending soon" warning with the real deadline;
//   - at the deadline: if EITHER side has spoken within
//     ENGAGED_WINDOW_SECONDS the deadline EXTENDS by
//     EXTENSION_SECONDS (the wrap-up/warning cycle re-arms) and the
//     client is told the new deadline — an active conversation never
//     dies at the mark;
//   - only at the ABSOLUTE cap, or at a deadline reached with no
//     recent activity on either side, does the session close — and
//     by then the wrap-up path has already run.
// Activity includes raw visitor mic activity (item 4), not just
// completed transcriptions, so a visitor mid-sentence counts.
export const SESSION_ABSOLUTE_CAP_SECONDS = 3600;
export const SESSION_EXTENSION_SECONDS = 300;
export const SESSION_WRAPUP_LEAD_SECONDS = 120;
export const SESSION_WARNING_LEAD_SECONDS = 60;

export interface SessionCeilingState {
  /** Current soft deadline, in elapsed seconds from session start. */
  deadlineSeconds: number;
  /** The absolute cap (elapsed seconds): no extension past this. */
  capSeconds: number;
  wrapupInjected: boolean;
  warningSent: boolean;
  closing: boolean;
}

export function freshSessionCeilingState(softSeconds: number): SessionCeilingState {
  const soft = Math.max(60, Math.floor(softSeconds) || 900);
  return {
    deadlineSeconds: soft,
    capSeconds: Math.max(soft, SESSION_ABSOLUTE_CAP_SECONDS),
    wrapupInjected: false,
    warningSent: false,
    closing: false,
  };
}

/**
 * One pacing tick of the ceiling machine. Returns the action the
 * proxy must perform, mutating only through the returned state:
 *   'wrapup' — inject the wrap-up guidance (once per deadline);
 *   'warn'   — tell the client to show the ending-soon warning;
 *   'extend' — push the deadline out (state already extended; the
 *              proxy tells the client the new deadline);
 *   'close'  — end the session now (wrap-up already ran at the
 *              lead marks, unless the cap arrived first);
 *   null     — nothing due.
 */
export function sessionCeilingAction(
  state: SessionCeilingState,
  elapsedSeconds: number,
  lastActivityAgoSeconds: number,
): { action: 'wrapup' | 'warn' | 'extend' | 'close' | null; state: SessionCeilingState } {
  if (state.closing) return { action: null, state };
  const remaining = state.deadlineSeconds - elapsedSeconds;
  if (remaining <= 0) {
    const active = lastActivityAgoSeconds <= ENGAGED_WINDOW_SECONDS;
    if (active && elapsedSeconds < state.capSeconds) {
      const extended = {
        ...state,
        deadlineSeconds: Math.min(state.capSeconds, state.deadlineSeconds + SESSION_EXTENSION_SECONDS),
        wrapupInjected: false,
        warningSent: false,
      };
      return { action: 'extend', state: extended };
    }
    return { action: 'close', state: { ...state, closing: true } };
  }
  if (!state.wrapupInjected && remaining <= SESSION_WRAPUP_LEAD_SECONDS) {
    return { action: 'wrapup', state: { ...state, wrapupInjected: true } };
  }
  if (!state.warningSent && remaining <= SESSION_WARNING_LEAD_SECONDS) {
    return { action: 'warn', state: { ...state, warningSent: true } };
  }
  return { action: null, state };
}

// SILENCE LADDER (Ron's spec, 2026-11-16): the Publish #60 silence
// ladder existed only as prompt prose and never fired on the voice
// path. This is the mechanical version, driven by the proxy's pacing
// timer and keyed on the VISITOR's silence:
//   rung 1 (~15s): ONE short "are you still there?" — then wait.
//   rung 2 (~40s): continue SELLING — one benefit, 20–30 seconds —
//                  ending in ONE quick yes/no re-engagement question.
//   rung 3 (~75s): final nudge — offer the demo link, warm thanks,
//                  goodbye; the proxy then ends the session.
// An episode resets the moment the visitor speaks again; each rung
// fires once per episode.
//
// CADENCE (corrected 2026-11-17): the first mechanical version
// measured silence from the later of BOTH sides' last speech, so
// every model turn — the greeting, a pitch, the ladder's own
// check-in — restarted the [15, 40, 75] climb at zero. Rung 2 then
// needed a further FULL 40s of total silence after the check-in and
// rung 3 a further 75s after the bridge, and whenever the visitor
// answered a check-in (a substantive turn, resetting the episode)
// the next quiet gap started over at rung 1: the ladder degenerated
// into repeated "are you still there?" check-ins and rungs 2–3 were
// unreachable (session 3cfadd76, 2026-11-17 — rung 1 fired at
// 20:33:13 and again at 20:33:43). Model turns now never restart
// the measurement; firing is instead suppressed while a model turn
// is in flight and for a short settle beat after it ends (see
// silenceLadderDue), so Aspen is never talked over and a threshold
// crossed during her turn fires as soon as she finishes.
//
// FLOOR TIME (corrected 2026-11-18, investigation of the owner's
// live tests): the Nov-17 cadence overshot. Because the clock ran
// from the visitor's last turn and model turns never touched it,
// ASPEN'S OWN SPEECH was billed to the visitor: any opener or pitch
// longer than ~11s put the visitor past rung 1 before she had even
// finished, so the check-in landed ~4s after she stopped (session
// 960a9562: greeting → check-in → bridge → goodbye in 87s with ZERO
// caller turns; session 37125a03: an engaged visitor whose answers
// reset the episode still ate three rung-1 fires because her long
// pitch turns re-crossed 15s). The rungs are now measured in
// VISITOR FLOOR TIME — seconds since the visitor's last completed
// turn MINUS the time Aspen herself was speaking in between
// (visitorFloorSeconds, computed by the proxy from its model-turn
// bookkeeping). The [15, 40, 75] spacing, the in-flight suppression
// and the settle/gap guards are unchanged; her speech simply no
// longer counts as his silence. A resumed session re-anchors the
// same way: the resumption line is a model turn, so the floor clock
// effectively starts when it ends.
export const SILENCE_RUNG_SECONDS = [15, 40, 75] as const;

/**
 * Whether a COMPLETED visitor turn counts as the visitor genuinely
 * speaking again — the only event that resets a silence episode.
 * The proxy used to reset the ladder on every raw transcription
 * FRAGMENT, so in a room with any background speech (a TV, another
 * conversation — Ron's staging retest, 2026-11-16, where one-word
 * fragments like "tú" and "¿Qué?" were transcribed as caller turns)
 * the episode reset constantly, rung 1 fired five times, and rungs
 * 2–3 never arrived. A real turn is at least three words; shorter
 * fragments are still answered by the model normally — they just
 * don't restart the ladder.
 *
 * 2026-11-18: the LADDER RESET no longer uses this ≥3-word rule —
 * it disenfranchised the exact replies the ladder provokes ("I'm
 * here" / "Estou aqui" are two words and could never stop the
 * climb; session bc5c110b). The reset now uses
 * contentFreeCallerTurn: ANY completed turn with recognisable
 * content resets. This function remains as the stricter substance
 * notion other paths were pinned against.
 */
export function substantiveCallerTurn(text: string): boolean {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  return words.length >= 3;
}

// Single words that ARE a complete, meaningful visitor turn when
// they arrive alone: short answers, greetings, politeness, and the
// standalone farewell cores (farewell.ts CORES). A one-word turn
// outside this set ("tellchis", "disconnected") is a clipped
// fragment of something longer, not a turn in its own right.
const STANDALONE_TURN_WORDS: ReadonlySet<string> = new Set([
  'yes', 'no', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay',
  'hi', 'hello', 'hey', 'thanks', 'please', 'stop', 'wait',
  'bye', 'goodbye', 'disconnect', 'adios', 'adeus', 'tchau',
  'sim', 'nao', 'ola', 'claro', 'vale', 'bueno',
  'gracias', 'obrigado', 'obrigada',
]);

/**
 * Whether a COMPLETED visitor turn is CONTENT-FREE — no recognisable
 * words, the predictable output of a clipped speech gate (only the
 * loudest slice of a word crosses, mid-word). Content-free turns are
 * NON-TURNS everywhere (2026-11-18 fix plan #5): they do not reset
 * the silence episode, they must not arm farewell detection, and —
 * per the resume policy in the session instructions — they must not
 * draw an apology or a "say that again": there was nothing to catch.
 * A turn is content-free when it is empty, or a single word that is
 * not a recognised standalone turn (STANDALONE_TURN_WORDS). Two or
 * more words always carry SOMETHING recognisable ("I'm here",
 * "Estou aqui", a name plus a word) and are never content-free.
 * Fragment protection proper lives in the client speech gate; this
 * is the backstop for what still gets through.
 */
export function contentFreeCallerTurn(text: string): boolean {
  const words = (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics: nao/adios fold to their base letters
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  if (words.length === 1) return !STANDALONE_TURN_WORDS.has(words[0]);
  return false;
}

/**
 * The visitor's silence in FLOOR TIME: wall-clock seconds since the
 * visitor's last completed turn, minus the time Aspen herself was
 * speaking in between. The proxy accumulates each model turn's
 * duration into modelBusyMs as the turn completes (and folds the
 * in-flight turn's elapsed time in live), so a 30-second greeting
 * contributes ~0 floor seconds: rung 1 can only fall due after the
 * visitor has actually held the floor, silent, for the rung's full
 * threshold. Clamped at zero — bookkeeping skew (a turn that ends
 * before the visitor's stamp, clock jitter) never yields negative
 * silence.
 */
export function visitorFloorSeconds(args: {
  nowMs: number;
  lastCallerTurnAtMs: number;
  modelBusyMs: number;
  modelTurnInFlight: boolean;
  modelTurnStartedAtMs: number;
}): number {
  const inFlightMs = args.modelTurnInFlight && args.modelTurnStartedAtMs > 0
    ? Math.max(0, args.nowMs - args.modelTurnStartedAtMs)
    : 0;
  const floorMs = args.nowMs - args.lastCallerTurnAtMs - args.modelBusyMs - inFlightMs;
  return Math.max(0, floorMs / 1000);
}

export function silenceLadderRung(silenceSeconds: number, currentRung: number): number {
  for (let rung = currentRung + 1; rung <= SILENCE_RUNG_SECONDS.length; rung++) {
    if (silenceSeconds >= SILENCE_RUNG_SECONDS[rung - 1]) return rung;
  }
  return 0;
}

// Firing guards layered over the raw rung math (2026-11-17). The
// settle beat gives the visitor a moment to start answering once
// Aspen finishes speaking before a crossed threshold fires; the
// minimum fire gap keeps a single long model turn that spans
// several thresholds from cascading the rungs back-to-back — the
// rungs still climb in order, each once. In the spec path (rungs
// 25s/35s apart, her turns a few seconds long) neither guard binds.
export const SILENCE_LADDER_MODEL_SETTLE_SECONDS = 4;
export const SILENCE_LADDER_MIN_FIRE_GAP_SECONDS = 8;

/**
 * Whether the ladder should fire on this pacing tick, and which
 * rung. `silenceSeconds` is the VISITOR's silence in FLOOR TIME
 * (visitorFloorSeconds: since his last completed turn, Aspen's own
 * speaking time excluded) — model turns never restart the episode;
 * they only gate the moment of firing:
 *   - never while a model turn is in flight (don't talk over her);
 *   - never within the settle beat after her turn ends;
 *   - never within the minimum gap after the previous rung fired
 *     (a fresh episode — currentRung 0 — is exempt, so a visitor
 *     who re-engages and goes quiet again is checked on normally).
 * After rung 3 the raw math returns 0 forever: no further
 * check-ins for that episode.
 */
export function silenceLadderDue(args: {
  silenceSeconds: number;
  currentRung: number;
  modelSpeaking: boolean;
  sinceModelTurnEndSeconds: number;
  sinceLastFireSeconds: number;
}): number {
  if (args.modelSpeaking) return 0;
  if (args.sinceModelTurnEndSeconds < SILENCE_LADDER_MODEL_SETTLE_SECONDS) return 0;
  if (args.currentRung > 0 && args.sinceLastFireSeconds < SILENCE_LADDER_MIN_FIRE_GAP_SECONDS) return 0;
  return silenceLadderRung(args.silenceSeconds, args.currentRung);
}

export const SILENCE_NUDGE_1 = 'The visitor has been quiet for a while. Say one short line only, warmly: "Are you still there?" Then stop and wait for them to speak.';
export const SILENCE_NUDGE_2 = 'The visitor is still quiet. Continue selling, briefly: give ONE real benefit of the service in about twenty seconds — for example that the video avatar greets every visitor face to face, or that no call or website question ever goes unanswered — then end with ONE quick yes-or-no question: "Want me to show you how it would look on your own website?" Then stop and wait.';
export const SILENCE_NUDGE_3 = 'The visitor is still quiet. Wrap up warmly in one or two short sentences: offer to send them the demo link so they can try it any time, thank them for their time, and say goodbye. Do not ask a question.';

// CLIENT IDLE-PROMPT GUARD (2026-11-22 — Ron's Aurelia Perez test
// calls): simulation sessions take their silence check-ins from
// the CLIENT's idle driver (the idle_prompt channel), whose clock
// is the browser's speech gate — a gate that misses soft speech,
// speech under playback echo, and speech the provider nonetheless
// transcribed. Twice in one call the check-in ("Are you still
// there? Take your time…") landed while the visitor was actively
// mid-flow, appended to the presenter's own substantive answer.
// The proxy holds the authoritative activity clocks — raw mic
// activity (the mic_activity channel), the last completed caller
// turn (the provider's own transcription), the last model turn —
// so a client check-in that contradicts them is suppressed here:
// a silence prompt may only ever key off ACTUAL inactivity.
export const IDLE_CHECKIN_ACTIVITY_WINDOW_MS = 20_000;
export const IDLE_CHECKIN_MODEL_SETTLE_MS = 15_000;

/**
 * Whether a client-driven silence check-in / silence goodbye must
 * be SUPPRESSED because the caller is not actually inactive:
 * a model turn is in flight (the injection would merge into it),
 * the caller was audibly active (mic activity) or completed a
 * turn within the activity window, or the model finished a turn
 * within the settle window (the two clocks disagree — the
 * server's wins).
 */
export function silenceCheckinSuppressed(args: {
  now: number;
  lastCallerSpeechAt: number;
  lastCallerTurnAt: number;
  lastModelTurnAt: number;
  modelTurnInFlight: boolean;
}): boolean {
  if (args.modelTurnInFlight) return true;
  if (args.now - args.lastCallerSpeechAt < IDLE_CHECKIN_ACTIVITY_WINDOW_MS) return true;
  if (args.now - args.lastCallerTurnAt < IDLE_CHECKIN_ACTIVITY_WINDOW_MS) return true;
  if (args.now - args.lastModelTurnAt < IDLE_CHECKIN_MODEL_SETTLE_MS) return true;
  return false;
}
