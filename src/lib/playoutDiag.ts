/**
 * Playout telemetry (volume-stream fix, 2026-11-14): after four
 * rounds of "the hardware volume keys still don't work", the paired
 * audio path must explain itself from the SESSION RECORD instead of
 * from guesses. SimliAvatar snapshots its playout state at every
 * settle point; GeminiConversation posts the snapshot to
 * gemini-session's playoutDiag action, which appends it to the
 * parent session row at config.playoutDiag. One SELECT after Ron's
 * next phone test then shows: which path was audible, whether the
 * tap ever engaged (and if not, the gate that refused it), whether
 * the returned stream's audio was unsubscribed, and the state of
 * every element in the graph.
 */
import type { PairedAudibleMode } from "@/lib/pairedAudible";
import type { SimliAudioTrackState, SimliStreamAudioOutcome } from "@/lib/simliStreamAudio";

/** Which path is producing the presenter's audible voice. */
export type PlayoutPath = "local" | "tap" | "direct" | "none";

/**
 * The LOCAL path's terminal sink (volume-speaker fix, 2026-11-14):
 * what the heard voice physically ends in, so the next phone test
 * reads the route from the record instead of from assumptions.
 *  - 'media-element': the media-element engine's element playing an
 *    MSE media resource (no AudioContext in the heard chain).
 *    Since Publish #54 this engine runs only behind the explicit
 *    ?heardEngine=element opt-in.
 *  - 'blob-element': the blob/file media-element engine's element
 *    playing whole WebM files (Publish #54's default terminal) —
 *    stamped distinctly so a session record proves WHICH element
 *    engine ran, never lumped in with the MSE engine's history.
 *  - 'media-stream': the #48 media sink — an element rendering a
 *    WebAudio MediaStreamDestination stream.
 *  - 'context': the bare AudioContext destination.
 *  - 'none': no local terminal exists (no local chunk yet).
 */
export type PlayoutTerminalSink = "media-element" | "blob-element" | "media-stream" | "context" | "none";

export interface PlayoutTerminalDiag {
  sink: PlayoutTerminalSink;
  /** The terminal element's paused state (context/none: true). */
  paused: boolean;
  /** The terminal element's readyState (context/none: 0). */
  readyState: number;
  /** True while any AudioContext node carries the heard signal. */
  ctxInChain: boolean;
  /** Media-element engine's buffered-ahead trail, seconds, when
   *  the terminal is the engine; null otherwise. */
  trailSec: number | null;
  /** Round 4 proof fields — the #51 record could not distinguish
   *  "engine never ran" from "engine failed silently", so the
   *  terminal now carries the engine's own state with it:
   *  engineState: 'idle' | 'starting' | 'ready' | 'failed', or
   *  'off' when the heard-engine A/B (?heardEngine=sink) disables
   *  the engine outright. */
  engineState?: string;
  /** Why the engine failed (its fail() reason), null while it
   *  has not failed. A start failure must be readable from the
   *  record, never inferred. */
  engineFailure?: string | null;
  /** The encoder ladder rung the platform accepted (24000 or
   *  48000), null before the probe settles / when none did. */
  encoderRate?: number | null;
  /** The TERMINAL element's muted flag — for the media-element
   *  terminal this is the proof the heard voice ends in an
   *  unmuted decoded-media element; null when the terminal has
   *  no element (context/none). */
  elementMuted?: boolean | null;
  /** The TERMINAL element's volume property (the slider level
   *  on the media-element route), null like elementMuted. */
  elementVolume?: number | null;
  /** Round 5 stall counters from the media-element engine:
   *  stall episodes opened, and episodes recovered in place.
   *  They ride EVERY terminal shape (the engine instance keeps
   *  counting from before a flip), so a session that ended on
   *  the sink still records how many stalls preceded the flip
   *  and how many were recovered before it. Undefined when no
   *  engine exists (heard-engine off / not yet created). */
  stalls?: number;
  recoveries?: number;
  /** Rate witness fields (Publish #54): the ACTUAL sample rate
   *  of the AudioContext carrying the heard signal (the sink
   *  graph's context — requested 24000, but the platform's real
   *  rate is what matters and was never stamped), null on the
   *  element terminals where no context is in the heard chain.
   *  Rendered as crate= next to the assumed erate=. */
  ctxRate?: number | null;
  /** The TERMINAL element's playbackRate at stamp time. No code
   *  in src/ ever sets it, so anything other than 1.00 is the
   *  platform's own doing — a smoking gun, stamped as prate=.
   *  Null when the terminal has no element (context/none). */
  elementPlaybackRate?: number | null;
  /** Rate witness aggregate (lib/rateWitness.ts): min / max /
   *  last of fed-seconds ÷ terminal-clock-seconds over the
   *  session's completed utterances on THIS terminal (≈1.00 is
   *  healthy; the factor itself when a terminal mis-rates).
   *  Null when the terminal has completed no utterance yet —
   *  rendered rw=- so the record shows the witness exists. */
  rateMin?: number | null;
  rateMax?: number | null;
  rateLast?: number | null;
}

export interface PlayoutDiagSnapshot {
  path: PlayoutPath;
  mode: PairedAudibleMode;
  /** Tap engaged (stream mode only; always false in local mode). */
  engaged: boolean;
  /** Tap AudioContext state ('running' | 'suspended' | 'none' | …). */
  ctxState: string;
  /** The gate that last refused the tap, when one did. */
  engageError: string | null;
  /** Simli (source) element state. */
  srcPaused: boolean;
  srcMuted: boolean;
  srcVolume: number;
  /** State of the returned stream's audio track in the page. */
  track: SimliAudioTrackState;
  /** Starve outcome for the returned audio (local mode). */
  starve: SimliStreamAudioOutcome | "pending" | "n/a";
  /** Media-tap playout element paused (stream mode tap). */
  playoutPaused: boolean;
  /** Tap gain value while engaged, else null. */
  gain: number | null;
  /** The local path's terminal sink (volume-speaker fix). Filled
   *  by GeminiConversation, which owns the local terminals;
   *  SimliAvatar snapshots leave it undefined. */
  terminal?: PlayoutTerminalDiag;
  /** The media tap's AudioContext ACTUAL sample rate (Publish
   *  #54 rate witness): PairedPlayout creates its context at the
   *  device default (44100/48000) and nothing ever stamped it.
   *  Null when no tap context exists. Rendered as tcrate=. */
  tapCtxRate?: number | null;
}

/**
 * The compact one-line form stored in the session record. Kept
 * `k=v;`-separated so a SQL eyeball (or a LIKE query) reads it
 * without JSON tooling.
 */
export function playoutDiagDetail(s: PlayoutDiagSnapshot): string {
  const parts = [
    `path=${s.path}`,
    `mode=${s.mode}`,
    `engaged=${s.engaged ? 1 : 0}`,
    `ctx=${s.ctxState}`,
    `err=${s.engageError ?? "-"}`,
    `src=${s.srcPaused ? "paused" : "playing"},${s.srcMuted ? "muted" : "unmuted"},v=${s.srcVolume}`,
    `track=${s.track}`,
    `starve=${s.starve}`,
    `out=${s.playoutPaused ? "paused" : "playing"}`,
    `gain=${s.gain === null ? "-" : s.gain}`,
  ];
  // Rate witness (Publish #54): the tap context's ACTUAL rate,
  // appended only when the snapshot carries the field, so
  // pre-witness snapshots keep their exact shape.
  if (s.tapCtxRate !== undefined) {
    parts.push(`tcrate=${s.tapCtxRate ?? "-"}`);
  }
  if (s.terminal) {
    parts.push(
      `term=${s.terminal.sink}`,
      `tp=${s.terminal.paused ? 1 : 0}`,
      `trs=${s.terminal.readyState}`,
      `ctxchain=${s.terminal.ctxInChain ? 1 : 0}`,
      `trail=${s.terminal.trailSec === null ? "-" : s.terminal.trailSec.toFixed(2)}`,
    );
    // Rate witness (Publish #54): the heard chain's ACTUAL rates
    // next to the assumed ones — the sink context's real
    // sampleRate (crate=, beside erate= below) and the terminal
    // element's playbackRate (prate=; 1.00 unless the platform
    // itself moved it). Appended only when the fields are
    // present, so older snapshot shapes stay byte-identical.
    if (s.terminal.ctxRate !== undefined) {
      parts.push(`crate=${s.terminal.ctxRate ?? "-"}`);
    }
    if (s.terminal.elementPlaybackRate !== undefined) {
      parts.push(`prate=${s.terminal.elementPlaybackRate === null ? "-" : s.terminal.elementPlaybackRate.toFixed(2)}`);
    }
    // Round 4 engine proof (see PlayoutTerminalDiag): which state
    // the media-element engine is in, why it failed if it did,
    // which encoder rate the platform accepted, and the terminal
    // element's own muted/volume. Absent fields render as '-'.
    if (s.terminal.engineState !== undefined) {
      parts.push(
        `eng=${s.terminal.engineState}`,
        `efail=${s.terminal.engineFailure ?? "-"}`,
        `erate=${s.terminal.encoderRate ?? "-"}`,
        `emut=${s.terminal.elementMuted === null || s.terminal.elementMuted === undefined ? "-" : s.terminal.elementMuted ? 1 : 0}`,
        `evol=${s.terminal.elementVolume === null || s.terminal.elementVolume === undefined ? "-" : s.terminal.elementVolume.toFixed(2)}`,
        // Round 5: stall episodes opened / recovered in place.
        // '-' when no engine exists to count them.
        `stalls=${s.terminal.stalls ?? "-"}`,
        `rec=${s.terminal.recoveries ?? "-"}`,
      );
    }
    // Rate witness aggregate (Publish #54): rw=min..max over the
    // terminal's completed utterances, rwl= the last one. '-'
    // when the terminal has completed none yet — the record
    // still proves the witness was running.
    if (s.terminal.rateMin !== undefined) {
      parts.push(
        `rw=${s.terminal.rateMin === null ? "-" : `${s.terminal.rateMin.toFixed(2)}..${(s.terminal.rateMax ?? s.terminal.rateMin).toFixed(2)}`}`,
        `rwl=${s.terminal.rateLast === null || s.terminal.rateLast === undefined ? "-" : s.terminal.rateLast.toFixed(2)}`,
      );
    }
  }
  return parts.join(";");
}

export interface PlayoutDiagPayload {
  sessionId: string;
  path: PlayoutPath;
  detail: string;
  at: number;
}

export function playoutDiagPayload(
  sessionId: string,
  snapshot: PlayoutDiagSnapshot,
  at: number,
  extraDetail = "",
): PlayoutDiagPayload {
  return {
    sessionId,
    path: snapshot.path,
    detail: (playoutDiagDetail(snapshot) + extraDetail).slice(0, 400),
    at,
  };
}

/**
 * Dedupe key: identical consecutive snapshots are posted once —
 * WITHIN one session. The session id is part of the key on purpose
 * (reconnect-stamp fix, 2026-11-14): Ron's failing 238 s session
 * was a RECONNECT whose state matched the prior session's last
 * stamp, and a session-blind key would have suppressed its first
 * stamp even if one had been emitted. A new session's first stamp
 * must always land.
 */
export function playoutDiagSignature(payload: PlayoutDiagPayload): string {
  return `${payload.sessionId}|${payload.path}|${payload.detail}`;
}
