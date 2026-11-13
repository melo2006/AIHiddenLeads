/**
 * In-panel speaker volume (2026-11-13 — Ron's Andriot phone test).
 *
 * Why this exists: on Android Chrome the widget's voice does not always
 * land on the media stream the hardware volume keys govern. The local
 * (voice-only / replay) path is re-routed through a media element (see
 * mediaSink.ts), but the paired Simli stream is a WebRTC media element
 * whose stream classification the web platform does not let page code
 * choose — while the microphone is live, Android can treat the call as
 * communication audio, and the side volume keys then miss Aspen/Sara
 * entirely (full blast, keys dead; on Bluetooth the headset's own
 * buttons worked, the phone's keys still didn't). No web API can force
 * the stream class, so the guaranteed lever is an in-app level applied
 * at BOTH playback sinks:
 *   - local path: the per-chunk speaker GainNode in GeminiConversation;
 *   - paired path: the Simli audio element's own volume (SimliAvatar).
 * Default is unity (1) — with the slider untouched, playback is exactly
 * as loud as it has always been, and the speaker-mute toggle still wins
 * over the slider (mute = 0 regardless of the stored level).
 */

export const PLAYBACK_VOLUME_STORAGE_KEY = "aspen-playback-volume";
export const DEFAULT_PLAYBACK_VOLUME = 1;

/** Clamp any incoming value to a usable 0..1 playback level. */
export function clampPlaybackVolume(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PLAYBACK_VOLUME;
  return Math.min(1, Math.max(0, n));
}

/** The level actually applied at a playback sink: mute always wins. */
export function effectivePlaybackLevel(muted: boolean, volume: number): number {
  return muted ? 0 : clampPlaybackVolume(volume);
}

/** The visitor's stored level (default unity when unset or unreadable). */
export function loadPlaybackVolume(): number {
  try {
    const raw = globalThis.localStorage?.getItem(PLAYBACK_VOLUME_STORAGE_KEY);
    if (raw === null || raw === undefined) return DEFAULT_PLAYBACK_VOLUME;
    return clampPlaybackVolume(Number.parseFloat(raw));
  } catch {
    return DEFAULT_PLAYBACK_VOLUME;
  }
}

/** Persist the visitor's level; failures (private mode, quotas) are silent. */
export function savePlaybackVolume(volume: number): void {
  try {
    globalThis.localStorage?.setItem(PLAYBACK_VOLUME_STORAGE_KEY, String(clampPlaybackVolume(volume)));
  } catch {
    /* Storage unavailable — the level still applies for this session. */
  }
}
