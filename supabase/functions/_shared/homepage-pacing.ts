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
// timer and keyed on the silence since the last speech on EITHER
// side (so Aspen's own long turns never read as visitor silence):
//   rung 1 (~15s): ONE short "are you still there?" — then wait.
//   rung 2 (~40s): continue SELLING — one benefit, 20–30 seconds —
//                  ending in ONE quick yes/no re-engagement question.
//   rung 3 (~75s): final nudge — offer the demo link, warm thanks,
//                  goodbye; the proxy then ends the session.
// An episode resets the moment the visitor speaks again; each rung
// fires once per episode.
export const SILENCE_RUNG_SECONDS = [15, 40, 75] as const;

export function silenceLadderRung(silenceSeconds: number, currentRung: number): number {
  for (let rung = currentRung + 1; rung <= SILENCE_RUNG_SECONDS.length; rung++) {
    if (silenceSeconds >= SILENCE_RUNG_SECONDS[rung - 1]) return rung;
  }
  return 0;
}

export const SILENCE_NUDGE_1 = 'The visitor has been quiet for a while. Say one short line only, warmly: "Are you still there?" Then stop and wait for them to speak.';
export const SILENCE_NUDGE_2 = 'The visitor is still quiet. Continue selling, briefly: give ONE real benefit of the service in about twenty seconds — for example that the video avatar greets every visitor face to face, or that no call or website question ever goes unanswered — then end with ONE quick yes-or-no question: "Want me to show you how it would look on your own website?" Then stop and wait.';
export const SILENCE_NUDGE_3 = 'The visitor is still quiet. Wrap up warmly in one or two short sentences: offer to send them the demo link so they can try it any time, thank them for their time, and say goodbye. Do not ask a question.';
