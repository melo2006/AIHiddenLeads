/**
 * Mic zero-input guard (2026-11-14): the INPUT mirror of the
 * playout telemetry in lib/playoutDiag.ts. Forensics (session
 * ef9986df, Publish #50): a phone test ran 4m53s with
 * input_audio_seconds = 0 — the visitor's microphone delivered
 * literally zero audio for the whole session. The presenter
 * monologued uninterruptibly (barge-in needs input audio), the
 * silence machinery closed the call, and the session record carried
 * NO microphone state, so the cause was undiagnosable after the
 * fact. This module is the two-part fix:
 *
 *  1. A flow tracker fed by EVERY microphone frame (the capture
 *     loops' raw per-frame RMS, before the noise gate substitutes
 *     silence — the true signal, not a proxy) plus a pure watchdog
 *     decision: if zero audio energy has flowed shortly after the
 *     session goes live — or flow stalls for a sustained stretch
 *     mid-session — the panel surfaces a persistent plain-language
 *     notice with a one-tap microphone recovery, instead of letting
 *     the presenter talk to a dead mic for minutes.
 *  2. A compact micDiag stamp (same `k=v;` form as playoutDiag)
 *     posted through the same gemini-session diag channel, landing
 *     on the parent session row at config.micDiag: permission
 *     state, track state, whether/when audio first flowed, total
 *     input captured, and whether the watchdog fired — so the next
 *     dead-mic session explains itself from the record.
 *
 * "Flowed" means real acoustic energy crossed the transducer: a
 * frame whose raw RMS exceeds MIC_ENERGY_EPSILON. Digital silence
 * — an OS-muted track, an ended track, a dead capture device —
 * never crosses it. This watchdog therefore detects a DEAD path,
 * not a quiet visitor.
 *
 * RECALIBRATION (Publish #56, 2026-11-14): the first version also
 * assumed a live mic in a quiet room crosses the energy epsilon
 * constantly (self-noise + room tone). The owner's phone disproved
 * it: with echo cancellation + noise suppression on, a quiet room
 * — and the owner's own QUIET SPEECH (he whispers beside a sleeping
 * partner) — can sit under the epsilon for a whole stall window,
 * so the guard false-fired on a working mic (Publish #52/#53
 * retests). The flow test is now two-tier:
 *
 *  - ENERGY (rms > MIC_ENERGY_EPSILON): speech-level flow, as
 *    before — drives first/last flow and the micDiag facts.
 *  - ALIVE (rms > 0, any non-zero frame at all): proof the path is
 *    a live transducer. A dead/OS-muted path delivers literally
 *    digital zeros (the ef9986df session's input was exactly 0);
 *    a live path in a silent room still ticks non-zero frames —
 *    room tone, a breath, NS gate breathing. The guard now fires
 *    only when BOTH tiers are silent for the full window: true
 *    zero-input still trips it on schedule, quiet speech and
 *    quiet listening never do.
 *
 * Direct track evidence outranks level inference entirely: when
 * the browser reports the track itself muted or ended, the path
 * is dead by the track's own testimony (see trackDead in the
 * snapshot, and the acquisition-time check in micTrackStartVerdict
 * — Publish #53's records showed tracks STARTING muted in 3 of 4
 * sessions, which must surface at once, not after a window).
 */

/** Raw-RMS floor for "the microphone heard something real". Far
 *  below speech (the panel's sound-detected meter trips ~0.007)
 *  and above the exact 0.0 a dead/ended/muted-at-OS track yields. */
export const MIC_ENERGY_EPSILON = 0.0001;
/** Startup window: zero flow this long after go-live = dead mic. */
export const MIC_WATCHDOG_STARTUP_MS = 8000;
/** Mid-session stall: zero flow this long (after having flowed)
 *  re-fires the guard, once per silent stretch. */
export const MIC_WATCHDOG_STALL_MS = 25000;
/** Grace for a track that reports `muted` the moment it is
 *  acquired: some devices start a track muted for a beat before
 *  the source unlocks, so the acquisition check waits this long
 *  for the `unmute` event before declaring the start dead. A
 *  track still muted after the grace is surfaced immediately
 *  (the guard's notice + Reconnect path), never silently. */
export const MIC_MUTED_START_GRACE_MS = 2000;

export interface MicFlowState {
  /** When the current voice session went live (ms epoch, 0 = not live). */
  liveSince: number;
  /** Mic frames observed since go-live (0 = the capture processor
   *  never ran at all — context/processor dead, a distinct shape
   *  from frames-with-digital-silence). */
  frames: number;
  /** Frames whose raw RMS crossed the energy epsilon. */
  energyFrames: number;
  /** First energy frame of this session (ms epoch, 0 = never). */
  firstFlowAt: number;
  /** Most recent energy frame (ms epoch, 0 = never). */
  lastFlowAt: number;
  /** Most recent NON-ZERO frame (ms epoch, 0 = never): the alive
   *  tier — any signal at all crossed the path, however quiet. A
   *  dead path never produces one (its frames are exact zeros). */
  lastAliveAt: number;
  /** The watchdog has fired for the current silent stretch;
   *  re-armed by the next energy frame. */
  firedForStretch: boolean;
  /** The watchdog fired at least once this session (diag fact). */
  watchdogFired: boolean;
}

export function createMicFlowState(): MicFlowState {
  return {
    liveSince: 0,
    frames: 0,
    energyFrames: 0,
    firstFlowAt: 0,
    lastFlowAt: 0,
    lastAliveAt: 0,
    firedForStretch: false,
    watchdogFired: false,
  };
}

/** A new voice session (or a fresh capture path after recovery)
 *  starts a new flow window: counters reset, the startup clock
 *  starts at go-live. Mutates and returns the state — the tracker
 *  is fed per audio frame, so it stays allocation-free. */
export function noteMicSessionLive(state: MicFlowState, now: number): MicFlowState {
  state.liveSince = now;
  state.frames = 0;
  state.energyFrames = 0;
  state.firstFlowAt = 0;
  state.lastFlowAt = 0;
  state.lastAliveAt = 0;
  state.firedForStretch = false;
  state.watchdogFired = false;
  return state;
}

/** Feed one microphone frame's raw RMS (pre-gate, straight from the
 *  capture loops). Energy frames stamp first/last flow and re-arm
 *  the watchdog for the next silent stretch; any non-zero frame
 *  stamps the alive tier (the path is a live transducer, however
 *  quiet the room or the speaker). */
export function noteMicFrame(state: MicFlowState, rms: number, now: number): MicFlowState {
  state.frames += 1;
  if (rms > 0) state.lastAliveAt = now;
  if (rms > MIC_ENERGY_EPSILON) {
    state.energyFrames += 1;
    if (state.firstFlowAt === 0) state.firstFlowAt = now;
    state.lastFlowAt = now;
    state.firedForStretch = false;
  }
  return state;
}

/** Record that the watchdog fired: it stays down for the rest of
 *  this silent stretch (the next energy frame re-arms it). */
export function noteMicWatchdogFired(state: MicFlowState): MicFlowState {
  state.firedForStretch = true;
  state.watchdogFired = true;
  return state;
}

/** Total seconds of input the frames represent (ScriptProcessor
 *  buffer of `bufferSize` samples at the mic context's rate). */
export function micInputSeconds(frames: number, bufferSize: number, sampleRate: number): number {
  if (frames <= 0 || bufferSize <= 0 || sampleRate <= 0) return 0;
  return (frames * bufferSize) / sampleRate;
}

export interface MicWatchdogSnapshot {
  now: number;
  /** A voice session is live. Type/chat mode never mounts a live
   *  voice session in GeminiConversation (the shells render it only
   *  in voice mode, and leaving voice mode ends capture), so a
   *  chat-mode panel always reads live=false here. */
  live: boolean;
  /** Hands-free only: in hold mode silence until the press is the
   *  design, not a dead mic (mirrors the mic-audibility hint). */
  handsFree: boolean;
  /** The visitor deliberately muted: never flagged. */
  muted: boolean;
  /** The visitor paused the call: capture is off on purpose. */
  paused: boolean;
  /** Twilio browser leg: capture is paused by design (AGENTS.md). */
  handoff: boolean;
  /** Drop recovery / persona swap in flight: never compete. */
  recoveryActive: boolean;
  /** When the session went live (ms epoch, 0 = not live). */
  liveSince: number;
  /** First audio energy of the session (ms epoch, 0 = never).
   *  The component folds gate passes and input transcriptions in
   *  as flow proof alongside the tracker's energy frames. */
  firstFlowAt: number;
  /** Most recent flow proof (ms epoch, 0 = never). */
  lastFlowAt: number;
  /** Most recent NON-ZERO frame (ms epoch, 0 = never): the alive
   *  tier. Optional for older callers; absent reads as 0. */
  lastAliveAt?: number;
  /** The browser reports the mic track itself muted or ended:
   *  the path is dead by direct evidence, whatever the levels
   *  say. Optional for older callers; absent reads as false. */
  trackDead?: boolean;
  /** Already fired for this silent stretch. */
  firedForStretch: boolean;
}

export function shouldShowMicWatchdog(s: MicWatchdogSnapshot): boolean {
  if (!s.live || !s.handsFree || s.muted || s.paused || s.handoff || s.recoveryActive) return false;
  if (s.liveSince <= 0 || s.firedForStretch) return false;
  // Direct track evidence outranks level inference: a track the
  // browser reports muted/ended is dead even if a stray non-zero
  // frame ticked the alive tier on its way down. Fires on the
  // startup clock (a mid-session track death is already past it,
  // so it surfaces at the next evaluation tick).
  if (s.trackDead) return s.now - s.liveSince >= MIC_WATCHDOG_STARTUP_MS;
  const aliveAt = s.lastAliveAt ?? 0;
  // Startup: nothing but digital zeros (or no frames at all) for
  // the whole window — the ef9986df shape (dead from the first
  // frame). Fires even while the presenter is mid-monologue: that
  // is precisely when the visitor needs it, unlike the turn-based
  // audibility hint. Any non-zero frame — room tone, a breath,
  // quiet speech the noise suppressor pushed under the energy
  // epsilon — proves the path alive and holds the guard off.
  if (s.firstFlowAt === 0) return aliveAt === 0 && s.now - s.liveSince >= MIC_WATCHDOG_STARTUP_MS;
  // Mid-session stall: the path died after having worked — no
  // speech energy AND no sign of life for the whole window. A
  // quietly listening visitor's mic keeps ticking alive frames,
  // so listening alone never reaches this either.
  return s.now - Math.max(s.lastFlowAt, aliveAt) >= MIC_WATCHDOG_STALL_MS;
}

/* ------------------------------------------------------------------ */
/* Acquisition-time track check (Publish #56): permission granted   */
/* is not a working microphone — Publish #53's session records      */
/* showed the track STARTING muted in 3 of 4 sessions, and the      */
/* session then ran "normally" on a dead path. The component runs   */
/* this verdict on every freshly acquired track: 'muted' earns a    */
/* short grace for the `unmute` event (some devices start a track   */
/* muted for a beat), then the guard surfaces immediately; 'ended'  */
/* surfaces at once — an ended track never revives.                 */
/* ------------------------------------------------------------------ */

export type MicTrackStartVerdict = "ok" | "muted" | "ended" | "none";

/** The minimal structural shape of a MediaStreamTrack this check
 *  needs (keeps the helper testable without a DOM lib). */
export interface MicTrackLike {
  readyState: string;
  muted: boolean;
}

export function micTrackStartVerdict(track: MicTrackLike | null | undefined): MicTrackStartVerdict {
  if (!track) return "none";
  if (track.readyState === "ended") return "ended";
  if (track.muted) return "muted";
  return "ok";
}

/* ------------------------------------------------------------------ */
/* micDiag stamp — the config.micDiag record (playoutDiag's sibling). */
/* ------------------------------------------------------------------ */

export type MicDiagEvent = "start" | "watchdog" | "recovered" | "end";
export type MicTrackState = "live" | "muted" | "ended" | "none";

export interface MicDiagStamp {
  event: MicDiagEvent;
  /** navigator.permissions microphone state, or 'unknown'. */
  permission: string;
  /** The mic track's own state: 'muted' here means the BROWSER/OS
   *  muted the track (track.muted), not the panel's mute toggle. */
  track: MicTrackState;
  /** Any audio energy has flowed this session. */
  flowed: boolean;
  /** ms from go-live to the first flowed frame; null = never. */
  firstFlowMs: number | null;
  /** Total mic frames the capture processor delivered. */
  inputFrames: number;
  /** The same frames as seconds of input (one decimal). */
  inputSec: number;
  /** The watchdog fired at least once this session. */
  fired: boolean;
}

/** The compact one-line form stored in the session record, in the
 *  same `k=v;` style as playoutDiagDetail so a SQL eyeball reads
 *  both the same way. */
export function micDiagDetail(s: MicDiagStamp): string {
  return [
    `ev=${s.event}`,
    `perm=${s.permission}`,
    `track=${s.track}`,
    `flow=${s.flowed ? 1 : 0}`,
    `first=${s.firstFlowMs === null ? "-" : s.firstFlowMs}`,
    `frames=${s.inputFrames}`,
    `sec=${s.inputSec.toFixed(1)}`,
    `fired=${s.fired ? 1 : 0}`,
  ].join(";");
}

export interface MicDiagPayload {
  sessionId: string;
  detail: string;
  at: number;
}

export function micDiagPayload(sessionId: string, stamp: MicDiagStamp, at: number): MicDiagPayload {
  return { sessionId, detail: micDiagDetail(stamp).slice(0, 400), at };
}

/** Dedupe key (session-scoped, like playoutDiagSignature): a new
 *  session's first stamp always lands; identical repeats within a
 *  session post once. */
export function micDiagSignature(payload: MicDiagPayload): string {
  return `${payload.sessionId}|${payload.detail}`;
}

/** Build a stamp from the flow tracker + the live track/permission
 *  facts the component reads at stamp time. */
export function micDiagStamp(args: {
  event: MicDiagEvent;
  flow: MicFlowState;
  permission: string;
  track: MicTrackState;
  inputSec: number;
}): MicDiagStamp {
  return {
    event: args.event,
    permission: args.permission,
    track: args.track,
    flowed: args.flow.firstFlowAt > 0,
    firstFlowMs: args.flow.firstFlowAt > 0 && args.flow.liveSince > 0 ? args.flow.firstFlowAt - args.flow.liveSince : null,
    inputFrames: args.flow.frames,
    inputSec: args.inputSec,
    fired: args.flow.watchdogFired,
  };
}
