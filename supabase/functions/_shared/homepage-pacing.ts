// Homepage sales pacing: soft wrap-up around seven minutes, continue only while the caller stays engaged.
export const HOMEPAGE_WRAPUP_SECONDS = 420;
export const HOMEPAGE_REVIEW_SECONDS = 600;
export const ENGAGED_WINDOW_SECONDS = 90;

export function homepagePacingAction(elapsed: number, lastCallerSpeechAgo: number, wrapupSent: boolean) {
  if (elapsed >= HOMEPAGE_REVIEW_SECONDS && lastCallerSpeechAgo > ENGAGED_WINDOW_SECONDS) return 'close';
  if (!wrapupSent && elapsed >= HOMEPAGE_WRAPUP_SECONDS) return 'wrapup';
  return null;
}

// SILENCE LADDER (Ron's spec, 2026-11-16): the Publish #60 silence
// ladder existed only as prompt prose and never fired on the voice
// path. This is the mechanical version, driven by the proxy's pacing
// timer and keyed on the VISITOR's silence — the cumulative seconds
// since the visitor's last substantive completed turn:
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
 */
export function substantiveCallerTurn(text: string): boolean {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  return words.length >= 3;
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
 * rung. `silenceSeconds` is the VISITOR's silence — seconds since
 * the last substantive completed visitor turn — and model turns
 * never restart it; they only gate the moment of firing:
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
