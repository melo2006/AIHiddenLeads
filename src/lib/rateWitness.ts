/**
 * Rate witness (Publish #54, 2026-11-14): the per-utterance proof
 * that a heard terminal consumes audio at the rate it was fed.
 *
 * The voice-wandering investigation (2026-11-14) found the heard
 * voice on moving-avatar sessions is locally re-originated Gemini
 * PCM, and that pitch+speed wandering together is the signature of
 * audio consumed at the wrong sample rate — but no session record
 * could convict a terminal, because nothing compared the fed
 * duration against the terminal's own clock. This module is that
 * comparison, kept pure so the math is unit-testable with fakes:
 *
 *   ratio = fedDurationSec / terminalClockAdvanceSec
 *
 * A healthy terminal reads ≈1.00. A terminal that plays 24 kHz-fed
 * audio as if it were 48 kHz burns through it in half the clock
 * advance and reads 2.00; one that drags reads below 1. The
 * aggregate (min / max / last over the session's completed
 * utterances) rides the playout diag stamp as rw= / rwl= — see
 * lib/playoutDiag.ts. Callers own the clocks: the blob/file engine
 * notes one utterance per completed file (fed = the file's PCM
 * duration, clock = the element's raw final currentTime), and
 * GeminiConversation notes one per drained run on the sink graph
 * (fed = the scheduled buffer durations, clock = the sink
 * element's — or the context's — currentTime advance).
 */
export interface RateWitnessState {
  /** Completed utterances noted so far. */
  count: number;
  /** Lowest ratio seen, null before the first utterance. */
  min: number | null;
  /** Highest ratio seen, null before the first utterance. */
  max: number | null;
  /** Most recent ratio, null before the first utterance. */
  last: number | null;
}

export function createRateWitness(): RateWitnessState {
  return { count: 0, min: null, max: null, last: null };
}

/**
 * The ratio for one utterance, or null when the measurement is
 * unusable (nothing fed, no clock advance, non-finite inputs) —
 * an interrupted or flushed utterance must never poison the
 * aggregate with a truncated clock.
 */
export function rateRatio(fedSec: number, clockSec: number): number | null {
  if (!Number.isFinite(fedSec) || !Number.isFinite(clockSec)) return null;
  if (fedSec <= 0 || clockSec <= 0) return null;
  const ratio = fedSec / clockSec;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/**
 * Fold one completed utterance into the aggregate. Returns the
 * noted ratio, or null when the utterance was discarded (see
 * rateRatio) — callers use the return to decide whether a fresh
 * diag stamp is worth posting.
 */
export function noteRateUtterance(state: RateWitnessState, fedSec: number, clockSec: number): number | null {
  const ratio = rateRatio(fedSec, clockSec);
  if (ratio === null) return null;
  state.count += 1;
  state.last = ratio;
  state.min = state.min === null ? ratio : Math.min(state.min, ratio);
  state.max = state.max === null ? ratio : Math.max(state.max, ratio);
  return ratio;
}

/** Back to the empty aggregate (a new session must not inherit
 *  the previous session's evidence). */
export function resetRateWitness(state: RateWitnessState): void {
  state.count = 0;
  state.min = null;
  state.max = null;
  state.last = null;
}
