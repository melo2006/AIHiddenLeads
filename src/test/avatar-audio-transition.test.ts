import { describe, expect, it } from 'vitest';
import { avatarAudioReady, faceActivationReady, nextVoiceChunkStart } from '@/lib/avatarAudioTransition';
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

describe('face activation verdict (Publish #62 — the meet-Alex face fix)', () => {
  // The 2026-11-15 presenter failure: Alex's pre-staged face was LIVE
  // in local-first mode, but the starve had unsubscribed its audio
  // track (LiveKit detaches it, nulling the element's srcObject), so
  // the old srcObject-based verdict read a healthy face as dead at
  // every cut-over/takeover and his face never attached.
  it('local-first mode: a live face is ready even with NO audio source (starved by design)', () => {
    expect(faceActivationReady({ live: true, streamMuted: true, hasAudioSource: false })).toBe(true);
    expect(faceActivationReady({ live: true, streamMuted: true, hasAudioSource: true })).toBe(true);
  });
  it('stream mode: a live face still needs its audio stream (a missing stream = a dead client)', () => {
    expect(faceActivationReady({ live: true, streamMuted: false, hasAudioSource: true })).toBe(true);
    expect(faceActivationReady({ live: true, streamMuted: false, hasAudioSource: false })).toBe(false);
  });
  it('a face that is not live is never ready, in either mode', () => {
    expect(faceActivationReady({ live: false, streamMuted: true, hasAudioSource: true })).toBe(false);
    expect(faceActivationReady({ live: false, streamMuted: true, hasAudioSource: false })).toBe(false);
    expect(faceActivationReady({ live: false, streamMuted: false, hasAudioSource: true })).toBe(false);
    expect(faceActivationReady({ live: false, streamMuted: false, hasAudioSource: false })).toBe(false);
  });
});