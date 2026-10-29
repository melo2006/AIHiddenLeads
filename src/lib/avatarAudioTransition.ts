export function avatarAudioReady(pending: boolean, queuedLocalChunks: number): boolean {
  return pending && queuedLocalChunks === 0;
}