export function avatarAudioReady(pending: boolean, queuedLocalChunks: number): boolean {
  return pending && queuedLocalChunks === 0;
}

/** Preserve contiguous PCM scheduling; add jitter headroom only at a drained queue. */
export function nextVoiceChunkStart(now: number, queuedUntil: number): number {
  return queuedUntil > now ? queuedUntil : now + 0.12;
}

export function assistantOutput(videoRequested: boolean, videoReady: boolean, replaying: boolean): 'local' | 'paired' | 'wait' {
  if (replaying || !videoRequested) return 'local';
  return videoReady ? 'paired' : 'wait';
}