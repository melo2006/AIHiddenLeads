// Behavioral proof for the 2026-11-14 audio root fix, through the
// real SimliAvatar (harness mirrors sara-volume-simli):
//
//  1. Hardware volume (defect 2): after a normal start, the paired
//     sound must ride the media tap — Simli's WebRTC element pinned
//     at volume 0 (still rendering for lip-sync), the plain playout
//     element carrying the tap stream, and the in-panel level landing
//     on the tap GAIN (element volume no longer carries the sound).
//
//  2. First-load silence (defect 1): an activate() that lands BEFORE
//     the face is live (the cold-first-load race: the visitor's tap
//     reaches the warm activation while the silent prewarm is still
//     starting) resolves false — that contract stands — but the
//     sound request must be COMPLETED when the face arrives, not
//     lost until a page reload.
import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SimliAvatar, { type SimliAvatarHandle } from '@/components/SimliAvatar';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), start: vi.fn(), send: vi.fn(), events: new Map<string, () => void>() }));
const tap = vi.hoisted(() => ({
  gains: [] as { gain: { value: number }; connect: ReturnType<typeof vi.fn> }[],
  destStream: { id: 'tap-destination-stream' },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('simli-client', () => ({
  LogLevel: { ERROR: 0 },
  SimliClient: class {
    constructor(_token: string, video: HTMLVideoElement, audio: HTMLAudioElement) {
      let paused = true;
      Object.defineProperty(audio, 'paused', { configurable: true, get: () => paused });
      audio.play = vi.fn(async () => { paused = false; });
      audio.muted = false;
      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
      Object.defineProperty(video, 'videoWidth', { configurable: true, value: 512 });
      audio.srcObject = { getAudioTracks: () => [{}] } as unknown as MediaStream;
    }
    on(event: string, callback: () => void) { mocks.events.set(event, callback); }
    start = mocks.start;
    stop = async () => {};
    sendAudioData = mocks.send;
    ClearBuffer() {}
  },
}));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {}, SARA_CHROMA_KEY_PROFILE: { low: 0.16, high: 0.26 } }));

class FakeAudioContext {
  state = 'running';
  destination = {};
  resume = async () => {};
  close = async () => {};
  createGain = () => { const g = { gain: { value: 1 }, connect: vi.fn() }; tap.gains.push(g); return g; };
  createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  createMediaStreamDestination = () => ({ stream: tap.destStream });
}

const avatar = { provider: 'simli' as const, enabled: true, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };

/** jsdom media elements never actually play: give the playout element
 *  the same paused/play behavior the mocked Simli element gets. */
const stubPlayout = (container: HTMLElement) => {
  const playout = container.querySelectorAll('audio')[1];
  let paused = true;
  Object.defineProperty(playout, 'paused', { configurable: true, get: () => paused });
  playout.play = vi.fn(async () => { paused = false; });
  playout.pause = vi.fn(() => { paused = true; });
  return playout;
};

const originalAudioContext = window.AudioContext;
afterEach(() => { window.AudioContext = originalAudioContext; });

const setup = () => {
  mocks.events.clear();
  tap.gains.length = 0;
  mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
  mocks.start.mockResolvedValue(undefined);
  window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  const ref = createRef<SimliAvatarHandle>();
  const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
  const playout = stubPlayout(view.container);
  const source = view.container.querySelector('audio');
  return { ref, view, playout, source };
};

describe('paired playout — media tap routing (hardware volume)', () => {
  it('moves the audible output onto the media tap after start; the level lands on the gain', async () => {
    const { ref, view, playout, source } = setup();
    await act(async () => { await ref.current?.start(); });
    await waitFor(() => expect(ref.current?.soundArmed?.()).toBe(true));
    // The playout element carries the tap stream; Simli's element is
    // pinned at volume 0 (rendering, not audible).
    expect(playout.srcObject).toBe(tap.destStream);
    expect(source?.volume).toBe(0);
    expect(source?.muted).toBe(false);
    // The in-panel level now drives the tap gain, not an element volume.
    act(() => ref.current?.setPlaybackVolume?.(0.4));
    expect(tap.gains[0].gain.value).toBeCloseTo(0.4);
    act(() => ref.current?.setPlaybackMuted?.(true));
    expect(tap.gains[0].gain.value).toBe(0);
    act(() => ref.current?.setPlaybackMuted?.(false));
    expect(tap.gains[0].gain.value).toBeCloseTo(0.4);
    act(() => ref.current?.stop());
    view.unmount();
  });
});

describe('paired playout — first-load activation race (defect 1)', () => {
  it('an activate() before the face is live resolves false but is completed when the face arrives', async () => {
    const { ref, view } = setup();
    // The visitor's tap lands while the silent prewarm is still
    // starting: no live face yet, so activation reports false...
    await act(async () => { expect(await ref.current?.activate()).toBe(false); });
    // ...then the prepared face finishes starting (silently prepared,
    // but the activation was already recorded).
    await act(async () => { await ref.current?.start({ silent: true }); });
    // The recorded request completes on its own: sound armed, no
    // reload, no second tap.
    await waitFor(() => expect(ref.current?.soundArmed?.()).toBe(true));
    act(() => ref.current?.stop());
    view.unmount();
  });
});
