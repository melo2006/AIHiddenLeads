export function avatarAudioReady(pending: boolean, queuedLocalChunks: number): boolean {
  return pending && queuedLocalChunks === 0;
}

/**
 * TAKEOVER RE-SYNC decision (2026-11-20 — the voice-first lip lag):
 * a voice-first segment's face attaches mid-turn through the
 * takeover, which flips chunk routing to paired. While the segment
 * ran voice-first, its chunks played LOCAL on the voice-only trail
 * with an unshifted schedule chained through the caller's
 * playTimeRef, and the face received nothing — so at the flip the
 * paired relationship (PAIRED_CAPTION_DELAY_SEC) does not exist:
 * the queue is running, not drained, and voiceChunkStartAt applies
 * its shift only at a drained queue, so the face's lips would trail
 * the voice for the rest of the turn. If any chunk already played
 * locally, the takeover must re-prime the offset — flush the heard
 * engine and reset the schedule anchor — so the next chunk restarts
 * drained and shifted, the same instant the face starts receiving
 * it. If nothing played yet, the flip is clean as-is: the first
 * chunk routes paired from the start and acquires the shift itself.
 */
export function takeoverShouldResync(pending: boolean, localChunksPlayed: number): boolean {
  return pending && localChunksPlayed > 0;
}

/**
 * Whether a silently pre-staged face may be activated / taken over —
 * the paired-audio guard's liveness verdict (SimliAvatar's activate
 * and cutoverAudioSync). A face that is not live is never ready, in
 * any mode. In STREAM mode the returned audio rides the element, so
 * a live face must also carry its audio stream: a missing stream
 * (hasAudioSource false) means the client is dead. In LOCAL-FIRST
 * mode (streamMuted — the default paired structure since the
 * 2026-11-14 volume-stream fix) the returned audio is deliberately
 * UNSUBSCRIBED the moment the face goes live (the starve), and
 * LiveKit detaches the track — which nulls the element's srcObject
 * when its last track leaves. A missing audio source is therefore
 * the DESIGNED steady state of a healthy local-mode face, and
 * liveness alone decides: the audible voice rides the caller's
 * local path, never this element. Judging a local-mode face by
 * srcObject condemned every swap's incoming face as "dead": the
 * face-first cut-over demoted to voice-first and the takeover's
 * sync refused forever, so the segment ran voice-over-portrait
 * for its whole life (the 2026-11-15 presenter test — Alex spoke
 * two full segments behind Frank's face).
 */
export function faceActivationReady(input: { live: boolean; streamMuted: boolean; hasAudioSource: boolean }): boolean {
  if (!input.live) return false;
  if (input.streamMuted) return true;
  return input.hasAudioSource;
}

/** Preserve contiguous PCM scheduling; add jitter headroom only at a drained queue. */
export function nextVoiceChunkStart(now: number, queuedUntil: number): number {
  return queuedUntil > now ? queuedUntil : now + 0.12;
}

/**
 * Seconds the paired (Simli) voice is heard after the local schedule that
 * drives captions: sendPcm24k batches PCM before handing it to the provider,
 * the provider renders it in the cloud, and the result streams back through a
 * jitter-buffered media pipeline. Caption windows on the paired path are
 * shifted by this amount so the word highlight estimates the HEARD voice
 * instead of the local clock. It remains an estimate — the provider exposes
 * no per-chunk playback position — and it is not applied to local playback
 * (voice-only calls, cached replay), which really is on the local clock.
 */
export const PAIRED_CAPTION_DELAY_SEC = 0.4;

/**
 * Volume-stream fix (2026-11-14): WHERE a paired chunk's 0.4 s shift
 * lives depends on which path is audible. On the Simli-stream path
 * (mode 'stream') the heard voice really is the returned stream, so
 * the shift stays on the CAPTION window and the local schedule is
 * only a silent clock. On the local-first path (mode 'local') the
 * Gemini chunk itself is audible through the media sink, so the
 * shift moves INTO the audible schedule — the voice lands when the
 * lips move — and the caption window rides the schedule unshifted.
 * Exactly one of the two ever carries the shift, never both.
 */
export function pairedCaptionDelaySec(pairedVideo: boolean, mode: "local" | "stream"): number {
  return pairedVideo && mode === "stream" ? PAIRED_CAPTION_DELAY_SEC : 0;
}

/**
 * Start time for one voice chunk. Contiguous runs chain at
 * `queuedUntil` (no gaps, no drift accumulation); a drained queue
 * restarts with the jitter headroom plus `shiftSec` — the local-first
 * paired shift above, 0 everywhere else, so non-paired scheduling is
 * byte-identical to nextVoiceChunkStart.
 */
export function voiceChunkStartAt(now: number, queuedUntil: number, shiftSec = 0): number {
  const base = nextVoiceChunkStart(now, queuedUntil);
  return queuedUntil > now ? base : base + shiftSec;
}

export function assistantOutput(videoRequested: boolean, videoReady: boolean, replaying: boolean): 'local' | 'paired' | 'wait' {
  if (replaying || !videoRequested) return 'local';
  return videoReady ? 'paired' : 'wait';
}

/**
 * Paired-audio guard (2026-11-10): should a non-local chunk DEGRADE to
 * local playback instead of being handed to the moving face? True
 * exactly when the chunk was routed away from local playback (paired,
 * or 'wait' — video requested but the face is not live, which the
 * player historically treated as paired) AND the hand-off cannot
 * succeed: the face is not live, or `sendPcm24k` refused the chunk.
 * A degraded chunk is then played through the local path and the
 * session continues voice-only; it must NEVER end the call. Local
 * chunks (voice-only sessions, cached replay — replaying forces
 * 'local' in assistantOutput) never degrade: they are already local.
 */
export function pairedAudioShouldDegrade(
  output: 'local' | 'paired' | 'wait',
  avatarLive: boolean,
  sendSucceeded: boolean,
): boolean {
  return output !== 'local' && (!avatarLive || !sendSucceeded);
}
