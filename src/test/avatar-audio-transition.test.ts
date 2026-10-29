import { describe, expect, it } from 'vitest';
import { avatarAudioReady } from '@/lib/avatarAudioTransition';
describe('avatar audio switch', () => {
  it('waits until local speech drains before switching to lip-synced audio', () => {
    expect(avatarAudioReady(true, 2)).toBe(false);
    expect(avatarAudioReady(true, 0)).toBe(true);
  });
  it('never activates a face which is not ready', () => {
    expect(avatarAudioReady(false, 0)).toBe(false);
  });
});