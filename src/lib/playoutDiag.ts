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
 *  - 'media-stream': the #48 media sink — an element rendering a
 *    WebAudio MediaStreamDestination stream.
 *  - 'context': the bare AudioContext destination.
 *  - 'none': no local terminal exists (no local chunk yet).
 */
export type PlayoutTerminalSink = "media-element" | "media-stream" | "context" | "none";

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
  if (s.terminal) {
    parts.push(
      `term=${s.terminal.sink}`,
      `tp=${s.terminal.paused ? 1 : 0}`,
      `trs=${s.terminal.readyState}`,
      `ctxchain=${s.terminal.ctxInChain ? 1 : 0}`,
      `trail=${s.terminal.trailSec === null ? "-" : s.terminal.trailSec.toFixed(2)}`,
    );
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
