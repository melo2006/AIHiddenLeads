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

export function assistantOutput(videoRequested: boolean, videoReady: boolean, replaying: boolean): 'local' | 'paired' | 'wait' {
  if (replaying || !videoRequested) return 'local';
  return videoReady ? 'paired' : 'wait';
}