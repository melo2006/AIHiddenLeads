export function avatarAudioReady(pending: boolean, queuedLocalChunks: number): boolean {
  return pending && queuedLocalChunks === 0;
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
