export type CaptureMode = "handsfree" | "hold";
export type NoiseFilter = "light" | "balanced" | "strong";
// Automatic gain can amplify steady engine/wind noise; strong
// filtering used to disable it for that reason. Restored under
// strong 2026-11-18 (investigation fix plan #3): with AGC off, a
// quiet speaker — the owner testing in a whisper beside a sleeping
// partner — sat permanently under the speech gate's bar while the
// gate sent literal silence in his place; the gate + VAD, not the
// gain, are the noise defences now. Hold-to-talk keeps AGC off (a
// deliberately keyed mic does not need help being heard).
export function microphoneAutoGain(mode: CaptureMode, filter: NoiseFilter) {
  return mode !== 'hold';
}
export const noiseThresholds: Record<NoiseFilter, number> = { light: 0.004, balanced: 0.012, strong: 0.025 };
// Send silence (not dropped frames) below the gate so server speech-end detection keeps working.
export function microphoneGate(rms: number, filter: NoiseFilter, now: number, openUntil: number) {
  const next = rms >= noiseThresholds[filter] ? now + 450 : openUntil;
  return { open: now < next, openUntil: next };
}

// ---------------------------------------------------------------------------
// Barge-in hardening (2026-11-17, Ron's phone + quiet-room laptop sessions):
// the stateless gate above opens on the FIRST frame over the threshold, so
// a single transient — a tap, a click, a burst of her own speaker echo —
// streamed ~450 ms of real room audio to the provider, whose VAD then cut
// Aspen off mid-sentence and transcribed a fragment she apologized for.
// The speech gate below is what the capture loops actually use now: the
// gate may only OPEN on SUSTAINED speech-level input, and while Aspen
// herself is speaking the bar is higher still — evaluated against the
// STRONG noise floor (×2) with a longer sustain — because in a quiet room
// the loudest thing her microphone hears is her own playback leaking back.
// A visitor who means to interrupt speaks up, sustained and louder than
// echo, and still gets through in well under half a second. Once open,
// the gate behaves exactly like the old one (same send threshold, same
// 450 ms speech-tail hangover), so established turns are never clipped.
//
// REVISION (2026-11-18, investigation fix plan #3): the hardening
// overshot for QUIET speakers. Stacked with AGC-off-under-strong and
// the provider VAD at LOW, a whispered answer never opened this gate
// at all — the client sent literal silence for the whole session
// (owner's sessions 960a9562 / 5b624454: live track, real energy,
// zero turns). The bars above are re-cut so a quiet voice has a
// path: opening bar capped at balanced, ~80 ms sustain, AGC restored
// under strong, speaking bar 1× strong over ~250 ms. Echo protection
// now rests on the speaking SUSTAIN (echo breaks at her pauses; a
// person talking over her does not) instead of a 2× level bar.
// ---------------------------------------------------------------------------

/** Sustained above-bar input required before the gate opens while the
 * visitor has the floor. 200 ms until 2026-11-18; cut to ~80 ms by
 * the investigation fix plan (#3): at 200 ms the gate ate the onset
 * of exactly the short, quiet answers it must pass ("yes", a name),
 * and what leaked through arrived as clipped fragments. 80 ms still
 * swallows a click or a knock (a single frame never opens the gate);
 * anything longer at speech level is treated as speech. */
export const SPEECH_GATE_SUSTAIN_MS = 80;
/** While Aspen is speaking, an interruption must prove itself longer:
 * echo follows her speech envelope and breaks at her natural pauses,
 * so a continuous ~250 ms run (400 ms until 2026-11-18) is what
 * separates a person talking over her from her own voice coming
 * back at her. */
export const SPEECH_GATE_SPEAKING_SUSTAIN_MS = 250;
/** The interruption bar while Aspen speaks: the STRONG threshold
 * itself, whatever filter is applied (2× strong until 2026-11-18 —
 * with AGC restored and the speaking sustain, 1× strong is the bar
 * a real interrupter clears and her echo, broken at her pauses,
 * does not sustain across). A manually lightened filter must not
 * lower the bar her own echo has to clear. */
export const SPEECH_GATE_SPEAKING_THRESHOLD = noiseThresholds.strong;
/** The highest bar the gate may demand to OPEN while the visitor
 * has the floor: the BALANCED threshold, even when the applied
 * filter is strong (2026-11-18 fix plan #3 — "drop the strong bar
 * toward balanced for gate opening"). The strong level still
 * governs the hangover extension once open, so an established turn
 * keeps strong-grade noise rejection; only the OPENING is eased,
 * which is where a quiet voice was being locked out. */
export const SPEECH_GATE_OPENING_MAX = noiseThresholds.balanced;

export interface SpeechGateState {
  /** Gate is open for the current frame (real audio passes). */
  open: boolean;
  /** Hangover deadline while open: the gate closes 450 ms after the
   * last frame at/above the plain send threshold. */
  openUntil: number;
  /** When the current continuous above-bar run began (-1 = no run;
   * frame timestamps are always >= 0, so -1 can never collide with a
   * run that legitimately starts at t=0). */
  runSince: number;
  /** Repetition-aware barge-in (2026-11-25): when the current
   * continuous above-NEAR-threshold run began while she speaks
   * (-1 = no run). A run that ends without opening the gate is a
   * near-miss burst; see SPEECH_GATE_NEAR_MISS_MIN_MS. */
  nearRunSince: number;
  /** Timestamps of the near-miss bursts counted inside the current
   * window (SPEECH_GATE_NEAR_WINDOW_MS); pruned as they age out. */
  nearMissAt: number[];
  /** While `now` is before this deadline, the speaking sustain is
   * lowered (SPEECH_GATE_LOWERED_SUSTAIN_MS): two or more near-miss
   * bursts proved a determined interrupter, so the next burst gets
   * through fast. 0 = bar at its normal height. */
  loweredUntil: number;
}

export function createSpeechGateState(): SpeechGateState {
  return { open: false, openUntil: 0, runSince: -1, nearRunSince: -1, nearMissAt: [], loweredUntil: 0 };
}

// ---------------------------------------------------------------------------
// REPETITION-AWARE BARGE-IN (2026-11-25, Ron approved "build both
// fixes"): the 250 ms speaking sustain is the echo defence, but it
// also defeats a DETERMINED interrupter whose attempts arrive as
// repeated bursts — a word or two over her, a breath, another try —
// each burst dying a few tens of ms short of the bar, the run reset
// by every dip. The gate now LEARNS from repetition, only while she
// speaks: a burst that sustains above the NEAR threshold (below the
// speaking bar, far above room tone) for at least
// SPEECH_GATE_NEAR_MISS_MIN_MS but ends without opening the gate
// counts as one near-miss. TWO near-misses inside
// SPEECH_GATE_NEAR_WINDOW_MS lower the speaking sustain to
// SPEECH_GATE_LOWERED_SUSTAIN_MS for the next few seconds, so the
// visitor's next burst interrupts her almost immediately.
// Echo protection is preserved three ways: a SINGLE isolated
// near-miss never lowers anything; bursts below the near threshold
// never count; and the near-miss minimum (180 ms) sits ABOVE the
// loud slices of her own playback in the pinned echo simulation
// (150 ms bursts), so her echo can never arm the lowered bar no
// matter how long it repeats. The lowered state resets the moment
// she stops speaking, when its window lapses, and when the gate
// opens (the interruption landed — the episode is over).
// ---------------------------------------------------------------------------

/** The near threshold while she speaks: speech-like energy clearly
 * above room tone but below the speaking bar (0.6 × strong). Like
 * the speaking bar itself it is filter-independent — a manually
 * lightened filter must not lower what echo has to clear. */
export const SPEECH_GATE_NEAR_THRESHOLD = noiseThresholds.strong * 0.6;
/** A burst must sustain at least this long above the near threshold
 * to count as a near-miss: word-length, not a click, a knock, or a
 * slice of her own echo (her simulated echo bursts run 150 ms). */
export const SPEECH_GATE_NEAR_MISS_MIN_MS = 180;
/** Near-misses only accumulate inside this rolling window — two
 * attempts a minute apart are not one determined interrupter. */
export const SPEECH_GATE_NEAR_WINDOW_MS = 4000;
/** How many near-misses inside the window lower the bar. One is an
 * accident (a cough, a door, one echo swell); two is a person. */
export const SPEECH_GATE_NEAR_MISS_COUNT = 2;
/** The lowered speaking sustain once repetition is proven: the full
 * strong level is still required — only the wait shrinks, into the
 * approved ~80–100 ms band. */
export const SPEECH_GATE_LOWERED_SUSTAIN_MS = 90;
/** How long the lowered bar stays armed after the qualifying
 * near-miss; after it lapses the full sustain applies again. */
export const SPEECH_GATE_LOWERED_WINDOW_MS = 4000;

/** Pure reducer: feed one frame's RMS. `speaking` is the caller's
 * composite "Aspen is generating or audibly playing right now" signal;
 * it raises the opening bar to SPEECH_GATE_SPEAKING_THRESHOLD and the
 * sustain to SPEECH_GATE_SPEAKING_SUSTAIN_MS — lowered to
 * SPEECH_GATE_LOWERED_SUSTAIN_MS while repetition has armed it
 * (see the repetition-aware block above). */
export function pushSpeechGateFrame(state: SpeechGateState, rms: number, filter: NoiseFilter, now: number, speaking: boolean): SpeechGateState {
  if (now < state.openUntil) {
    // Already open: an established turn extends on the plain send
    // threshold (speech tails dip; the hangover carries them), exactly
    // the pre-hardening gate's close behavior. The interruption the
    // repetition state was tracking has landed (or a plain turn is
    // under way): the near-miss bookkeeping resets.
    const openUntil = rms >= noiseThresholds[filter] ? now + 450 : state.openUntil;
    return { open: true, openUntil, runSince: -1, nearRunSince: -1, nearMissAt: [], loweredUntil: 0 };
  }
  if (!speaking) {
    // The visitor has the floor: the original opening bar/sustain,
    // unchanged. Her speaking ending also resets the repetition
    // state — a lowered bar earned against one utterance must not
    // leak into the next one.
    const bar = Math.min(noiseThresholds[filter], SPEECH_GATE_OPENING_MAX);
    if (rms < bar) return { open: false, openUntil: state.openUntil, runSince: -1, nearRunSince: -1, nearMissAt: [], loweredUntil: 0 };
    const runSince = state.runSince >= 0 ? state.runSince : now;
    if (now - runSince >= SPEECH_GATE_SUSTAIN_MS) return { open: true, openUntil: now + 450, runSince: -1, nearRunSince: -1, nearMissAt: [], loweredUntil: 0 };
    return { open: false, openUntil: state.openUntil, runSince, nearRunSince: -1, nearMissAt: [], loweredUntil: 0 };
  }
  // She is speaking. First the repetition bookkeeping: track the
  // current above-near run, and when a run ends without the gate
  // having opened, count it as a near-miss if it was word-length.
  let nearRunSince = state.nearRunSince;
  let nearMissAt = state.nearMissAt;
  let loweredUntil = now < state.loweredUntil ? state.loweredUntil : 0;
  if (rms >= SPEECH_GATE_NEAR_THRESHOLD) {
    if (nearRunSince < 0) nearRunSince = now;
  } else {
    if (nearRunSince >= 0 && now - nearRunSince >= SPEECH_GATE_NEAR_MISS_MIN_MS) {
      nearMissAt = [...nearMissAt.filter((t) => now - t < SPEECH_GATE_NEAR_WINDOW_MS), now];
      if (nearMissAt.length >= SPEECH_GATE_NEAR_MISS_COUNT) {
        loweredUntil = now + SPEECH_GATE_LOWERED_WINDOW_MS;
        nearMissAt = [];
      }
    }
    nearRunSince = -1;
  }
  const bar = SPEECH_GATE_SPEAKING_THRESHOLD;
  if (rms < bar) return { open: false, openUntil: state.openUntil, runSince: -1, nearRunSince, nearMissAt, loweredUntil };
  const runSince = state.runSince >= 0 ? state.runSince : now;
  const sustain = loweredUntil > 0 ? SPEECH_GATE_LOWERED_SUSTAIN_MS : SPEECH_GATE_SPEAKING_SUSTAIN_MS;
  if (now - runSince >= sustain) return { open: true, openUntil: now + 450, runSince: -1, nearRunSince: -1, nearMissAt: [], loweredUntil: 0 };
  return { open: false, openUntil: state.openUntil, runSince, nearRunSince, nearMissAt, loweredUntil };
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

/** AUTO-PICK POLICY (Ron's order, 2026-11-17 — supersedes the 2026-11-16
 * balanced↔strong clamp): the automatic room check NEVER relaxes the
 * applied filter on its own. Whatever the tracker measures, the applied
 * filter stays STRONG until the visitor makes an explicit manual pick —
 * a quiet room is precisely where her own speaker echo is the loudest
 * signal the mic hears, and the old clamp's silent slide to Balanced is
 * what let that echo interrupt her three times in a silent room (Ron's
 * rebooted-laptop retest, 2026-11-17, settings screenshot showing
 * "Balanced filtering — everyday" he never chose). The tracker's pick
 * is accepted as input and deliberately not applied: the parameter
 * stays so the call site keeps measuring and can log the suggestion. */
export function autoNoiseFilter(_trackerPick: NoiseFilter): NoiseFilter {
  return "strong";
}

/** The environment the settings dialog presents as IN FORCE. In auto
 * mode that is the standing assumption — Noisy — not the measured
 * floor: the dialog's readout and its Quiet/Normal/Noisy pills describe
 * the filtering actually applied, and in auto the applied environment
 * is Noisy by rule. After a manual pick the readout goes back to the
 * measured room, as before. The raw floor still feeds diagnostics. */
export function appliedAmbientLevel(manual: boolean, floor: number): AmbientLevel {
  return manual ? ambientLevelForFloor(floor) : "noisy";
}

/** The noise filter the capture gate actually runs with, AFTER
 * auto/manual resolution: a manual pick applies as chosen; in auto
 * the applied filter is STRONG by rule (autoNoiseFilter), whatever
 * the component state currently holds — a stored pick the
 * initializer honored is superseded by auto resolution at the first
 * ambient re-evaluation, so the raw state can sit on a stale value
 * (a session's start stamp read nf=balanced in an auto session,
 * 2026-11-17). Diagnostics record THIS — micDiag's nf= is what the
 * gate applied; amb= separately records what the room measured —
 * so a field reading never confuses the two again. */
export function appliedNoiseFilter(manual: boolean, current: NoiseFilter): NoiseFilter {
  return manual ? current : autoNoiseFilter(current);
}

// ---------------------------------------------------------------------------
// DEAD-AIR EXCEPTION to the never-relax policy (2026-11-18,
// investigation fix plan #3). The never-relax rule protects against
// her own echo in a quiet room — but it has one fatal shape: a mic
// delivering real, continuous energy whose level simply never
// reaches the strong gate (a quiet speaker, a low-gain device).
// There the gate stays shut for the WHOLE session, the provider
// hears literal silence, and no amount of visitor speech can ever
// register — the owner's 2026-11-18 sessions exactly (675 energy
// frames, gate never opened). When the evidence says energy is
// flowing yet the gate has NEVER opened well into a session, the
// applied filter relaxes ONE level, once, mid-session — and the
// component stamps it in micDiag (relax=) so the field record shows
// the moment the path opened. Manual picks are the visitor's own
// choice and are never overridden; a gate that has opened even once
// proves the path works and earns no relax.
// ---------------------------------------------------------------------------

/** How long the session must have been live before dead air is
 * declared: long enough for the greeting plus a real chance to
 * answer — a slow starter is not a dead path. */
export const GATE_DEAD_AIR_MIN_LIVE_MS = 20_000;
/** Watchdog-grade energy frames (micDiag's energy tier) that must
 * have flowed: proof the mic is alive and producing sound, not a
 * dead stream (a dead stream is the watchdog's own notice, not a
 * relax case). */
export const GATE_DEAD_AIR_MIN_ENERGY_FRAMES = 30;

export function deadAirRelaxedFilter(args: {
  applied: NoiseFilter;
  manual: boolean;
  alreadyRelaxed: boolean;
  gateEverOpened: boolean;
  energyFrames: number;
  liveMs: number;
}): NoiseFilter | null {
  if (args.manual || args.alreadyRelaxed || args.gateEverOpened) return null;
  if (args.liveMs < GATE_DEAD_AIR_MIN_LIVE_MS) return null;
  if (args.energyFrames < GATE_DEAD_AIR_MIN_ENERGY_FRAMES) return null;
  if (args.applied === "strong") return "balanced";
  if (args.applied === "balanced") return "light";
  return null;
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

/**
 * Base64 for a PCM16 frame without the byte-by-byte string concatenation the
 * mic handlers used to run per frame (one `+=` per byte, on the main thread,
 * ~8×/second). Chunked fromCharCode is the encoding the clean-room test app
 * proved out on 2026-11-20; output is byte-identical to the slow loop.
 */
export function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
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