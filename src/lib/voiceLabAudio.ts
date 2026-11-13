export type CaptureMode = "handsfree" | "hold";
export type NoiseFilter = "light" | "balanced" | "strong";
// Automatic gain can amplify steady engine/wind noise; strong filtering disables it.
export function microphoneAutoGain(mode: CaptureMode, filter: NoiseFilter) {
  return mode !== 'hold' && filter !== 'strong';
}
export const noiseThresholds: Record<NoiseFilter, number> = { light: 0.004, balanced: 0.012, strong: 0.025 };
// Send silence (not dropped frames) below the gate so server speech-end detection keeps working.
export function microphoneGate(rms: number, filter: NoiseFilter, now: number, openUntil: number) {
  const next = rms >= noiseThresholds[filter] ? now + 450 : openUntil;
  return { open: now < next, openUntil: next };
}

// ---------------------------------------------------------------------------
// Ambient noise estimation + automatic filter pick (Batch 1, 2026-11-12).
// Pure and framework-free so the whole policy is unit-testable: the capture
// loops feed per-frame RMS values into a rolling window, the window's low
// percentile estimates the room's noise floor (speech bursts sit in the top
// percentiles and barely move it), and the floor picks the gate filter.
// ---------------------------------------------------------------------------

/** Smoothed room classification shown beside the mic meter. */
export type AmbientLevel = "quiet" | "normal" | "noisy";

/** Floor bands, offset from the gate thresholds in noiseThresholds
 * (light 0.004 / balanced 0.012 / strong 0.025): a room whose floor is just
 * under the balanced gate threshold needs only light filtering, and a floor
 * approaching the strong threshold is already drowning the balanced gate. */
export const AMBIENT_LIGHT_MAX = 0.006;
export const AMBIENT_STRONG_MIN = 0.018;

/** Estimate the ambient noise floor from a rolling window of per-frame RMS
 * samples: the ~20th percentile, so brief speech bursts (which occupy the
 * loud tail) do not masquerade as room noise. Empty window reads as 0. */
export function estimateNoiseFloor(rmsSamples: number[]): number {
  const sorted = rmsSamples.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.2));
  return sorted[index];
}

/** Pick the noise filter for a floor estimate. With no `current`, the plain
 * bands apply. With a current filter, each boundary gains a dead zone
 * (light holds until +40% past the light band edge, balanced holds from
 * -30% below the light edge to +25% past the strong edge, strong holds
 * until -25% below the strong edge) so a floor hovering at a boundary can
 * never flap the filter back and forth between checks. */
export function pickNoiseFilterForFloor(floor: number, current?: NoiseFilter): NoiseFilter {
  if (current === "strong" && floor >= AMBIENT_STRONG_MIN * 0.75) return "strong";
  if (current === "light" && floor < AMBIENT_LIGHT_MAX * 1.4) return "light";
  if (current === "balanced" && floor >= AMBIENT_LIGHT_MAX * 0.7 && floor < AMBIENT_STRONG_MIN * 1.25) return "balanced";
  return floor < AMBIENT_LIGHT_MAX ? "light" : floor < AMBIENT_STRONG_MIN ? "balanced" : "strong";
}

/** The room label for a floor estimate — the same bands as the filter pick,
 * in the meter's vocabulary (light ↔ Quiet, balanced ↔ Normal, strong ↔ Noisy). */
export function ambientLevelForFloor(floor: number): AmbientLevel {
  const filter = pickNoiseFilterForFloor(floor);
  return filter === "light" ? "quiet" : filter === "strong" ? "noisy" : "normal";
}

/** How many per-frame RMS samples the rolling window keeps. At the capture
 * loop's ~2048-sample frames (≈23/sec at 48 kHz) 256 samples span roughly
 * 8–11 seconds of room sound — long enough to smooth speech bursts, short
 * enough to follow a door opening or a TV turning on. */
export const AMBIENT_WINDOW_MAX_SAMPLES = 256;

export interface AmbientGateState {
  samples: number[];
  floor: number;
  filter: NoiseFilter;
}

export function createAmbientGateState(filter: NoiseFilter = "balanced"): AmbientGateState {
  return { samples: [], floor: 0, filter };
}

/** Pure reducer: append one frame's RMS, trim the window, re-estimate the
 * floor and re-pick the filter (with hysteresis against the last pick). */
export function pushAmbientRms(state: AmbientGateState, rms: number, maxSamples: number = AMBIENT_WINDOW_MAX_SAMPLES): AmbientGateState {
  const samples = [...state.samples, rms];
  if (samples.length > maxSamples) samples.splice(0, samples.length - maxSamples);
  const floor = estimateNoiseFloor(samples);
  return { samples, floor, filter: pickNoiseFilterForFloor(floor, state.filter) };
}

// Some mobile audio drivers ignore the requested context rate. Send real 16 kHz PCM,
// not device-rate samples mislabeled as 16 kHz (which changes speech speed/pitch).
export function microphonePcm(input: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / 16000;
  const output = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let total = 0;
    for (let j = start; j < end; j++) total += input[j];
    const value = Math.max(-1, Math.min(1, total / (end - start)));
    output[i] = value < 0 ? value * 32768 : value * 32767;
  }
  return output;
}

// Every new voice session starts hands-free. The persisted "voice-capture-mode"
// preference is deliberately NOT consulted here: a session that once ended in
// hold mode used to make every later session silently start in hold-to-talk,
// so the visitor spoke while only silence was sent (2026-11-09 incident).
// Hold-to-talk stays available as an in-session settings choice only.
export function initialCaptureMode(): CaptureMode {
  return "handsfree";
}

export function shouldSendMicrophone(mode: CaptureMode, held: boolean, muted: boolean, replaying: boolean): boolean {
  return !muted && !replaying && (mode === "handsfree" || held);
}