import { describe, expect, it } from 'vitest';
import { assistantOutput } from '@/lib/avatarAudioTransition';
describe('synchronized assistant output', () => {
  it('never emits local speech in moving-avatar mode', () => {
    expect(assistantOutput(true, true, false)).toBe('paired');
    expect(assistantOutput(true, false, false)).toBe('wait');
  });
  it('uses local audio only for voice-only calls and cached replay', () => {
    expect(assistantOutput(false, false, false)).toBe('local');
    expect(assistantOutput(true, true, true)).toBe('local');
  });
});