// Behavioral proof for the local-first paired playout
// (volume-stream fix, 2026-11-14), through the real SimliAvatar
// with streamAudio='muted' and a fake LiveKit Room behind the
// mocked simli-client:
//
//  1. The returned stream is NEVER made audible: the element stays
//     muted at volume 0 through start, activate, cut-over and every
//     level change — the in-panel level lives on the caller's local
//     gain in this mode, never on this element.
//  2. The returned audio is STARVED: the LiveKit audio publication
//     is unsubscribed, so no RTC audio receiver stays live in the
//     page (the footprint the Android audio policy classifies with
//     the voice-communication channel).
//  3. Telemetry says so: the settle-point snapshots report
//     path='local', starve='unsubscribed', track='absent'.
//  4. The paired-audio guard contracts stand: activate() before the
//     face is live still resolves false; soundArmed() tracks
//     liveness (audibility itself is the caller's local path).
import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SimliAvatar, { type SimliAvatarHandle } from '@/components/SimliAvatar';
import type { PlayoutDiagSnapshot } from '@/lib/playoutDiag';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), start: vi.fn(), send: vi.fn(), events: new Map<string, () => void>() }));
const room = vi.hoisted(() => {
  const setSubscribed = vi.fn((subscribed: boolean) => {
    if (!subscribed) room.audioPub.track = undefined; // LiveKit drops the track on unsubscribe
  });
  const audioPub: { kind: string; setSubscribed: typeof setSubscribed; track: unknown } = {
    kind: 'audio',
    setSubscribed,
    track: { kind: 'audio', isMuted: false, mediaStreamTrack: { readyState: 'live' }, detach: vi.fn() },
  };
  const room = {
    setSubscribed,
    audioPub,
    pc: {
      remoteParticipants: new Map([
        ['simli', { trackPublications: new Map([['pub-audio', audioPub], ['pub-video', { kind: 'video', track: { kind: 'video' } }]]) }],
      ]),
    },
  };
  return room;
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('simli-client', () => ({
  LogLevel: { ERROR: 0 },
  SimliClient: class {
    connection = { pc: room.pc };
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

const avatar = { provider: 'simli' as const, enabled: true, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };

const setup = () => {
  mocks.events.clear();
  room.setSubscribed.mockClear();
  room.audioPub.track = { kind: 'audio', isMuted: false, mediaStreamTrack: { readyState: 'live' }, detach: vi.fn() };
  mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
  mocks.start.mockResolvedValue(undefined);
  const snapshots: PlayoutDiagSnapshot[] = [];
  const ref = createRef<SimliAvatarHandle>();
  const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed streamAudio="muted" onPlayoutDiag={(s) => snapshots.push(s)} />);
  const source = view.container.querySelector('audio');
  return { ref, view, source, snapshots };
};

afterEach(() => { vi.clearAllTimers(); });

describe('local-first paired playout — the returned stream is never audible', () => {
  it('start leaves the element muted, unsubscribes the returned audio, and reports path=local', async () => {
    const { ref, view, source, snapshots } = setup();
    await act(async () => { await ref.current?.start(); });
    await waitFor(() => expect(ref.current?.soundArmed?.()).toBe(true));
    // The returned audio was unsubscribed, not merely turned down.
    expect(room.setSubscribed).toHaveBeenCalledWith(false);
    expect(source?.muted).toBe(true);
    expect(source?.volume).toBe(0);
    // Telemetry: the settle snapshot names the structure.
    const last = snapshots[snapshots.length - 1];
    expect(last.path).toBe('local');
    expect(last.mode).toBe('local');
    expect(last.starve).toBe('unsubscribed');
    expect(last.track).toBe('absent');
    expect(last.srcMuted).toBe(true);
    expect(last.engaged).toBe(false); // the media tap never engages in this mode
    expect(ref.current?.playoutSnapshot?.().path).toBe('local');
    // Level changes never unmute the element: the level lives on
    // the caller's local gain in this mode.
    act(() => ref.current?.setPlaybackVolume?.(0.4));
    act(() => ref.current?.setPlaybackMuted?.(false));
    expect(source?.muted).toBe(true);
    expect(source?.volume).toBe(0);
    // Activation + cut-over succeed on liveness and keep the mute.
    await act(async () => { expect(await ref.current?.activate()).toBe(true); });
    await act(async () => { expect(await ref.current?.cutoverAudioSync?.({ muted: false, deviceId: null, volume: 0.7 })).toBe(true); });
    expect(source?.muted).toBe(true);
    act(() => ref.current?.stop());
    view.unmount();
  });

  it('an activate() before the face is live still resolves false, and the recorded request starves on live', async () => {
    const { ref, view, snapshots } = setup();
    await act(async () => { expect(await ref.current?.activate()).toBe(false); });
    await act(async () => { await ref.current?.start({ silent: true }); });
    await waitFor(() => expect(ref.current?.soundArmed?.()).toBe(true));
    expect(room.setSubscribed).toHaveBeenCalledWith(false);
    expect(snapshots.some((s) => s.starve === 'unsubscribed')).toBe(true);
    act(() => ref.current?.stop());
    view.unmount();
  });
});
