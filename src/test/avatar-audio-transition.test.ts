import { describe, expect, it } from 'vitest';
import { avatarAudioReady, nextVoiceChunkStart } from '@/lib/avatarAudioTransition';
describe('avatar audio switch', () => {
  it('never inserts a new video delay between queued speech chunks', () => {
    expect(nextVoiceChunkStart(1, 1.2)).toBe(1.2);
    expect(nextVoiceChunkStart(1.19, 1.2)).toBe(1.2);
    expect(nextVoiceChunkStart(2, 1.2)).toBeCloseTo(2.12);
  });
  it('waits until local speech drains before switching to lip-synced audio', () => {
    expect(avatarAudioReady(true, 2)).toBe(false);
    expect(avatarAudioReady(true, 0)).toBe(true);
  });
  it('never activates a face which is not ready', () => {
    expect(avatarAudioReady(false, 0)).toBe(false);
  });
});