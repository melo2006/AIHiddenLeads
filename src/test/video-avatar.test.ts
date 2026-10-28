import { describe, expect, it } from 'vitest';
import { normalizeVideoAvatar, pcm24kTo16k, ASPEN_SIMLI_FACE, validFaceId } from '../../supabase/functions/_shared/video-avatar';

describe('video avatar settings', () => {
  it('older agents without settings stay voice only with the Aspen face', () => {
    expect(normalizeVideoAvatar(undefined)).toMatchObject({ enabled: false, faceId: ASPEN_SIMLI_FACE, position: 'bottom-right', shape: 'circle' });
  });
  it('clamps size to the slider range', () => {
    expect(normalizeVideoAvatar({ size: 9999 }).size).toBe(360);
    expect(normalizeVideoAvatar({ size: 10 }).size).toBe(96);
  });
  it('rejects invalid face ids and positions', () => {
    expect(validFaceId('../etc')).toBe(false);
    expect(normalizeVideoAvatar({ faceId: 'x', position: 'middle' })).toMatchObject({ faceId: ASPEN_SIMLI_FACE, position: 'bottom-right' });
  });
  it('downsamples Gemini 24 kHz audio to Simli 16 kHz', () => {
    expect(pcm24kTo16k(new Int16Array(2400)).length).toBe(1600);
  });
});
