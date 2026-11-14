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

/** Dedupe key: identical consecutive snapshots are posted once. */
export function playoutDiagSignature(payload: PlayoutDiagPayload): string {
  return `${payload.path}|${payload.detail}`;
}
