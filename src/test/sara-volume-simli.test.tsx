// Bug 1 (2026-11-13) — behavioral proof that the in-panel speaker
// volume reaches the PAIRED (Simli) playback path: the handle's
// setPlaybackVolume drives the actual audio element, unmute restores
// the chosen level (not unity), a level set before start is what the
// start unmute applies, and the cut-over sync carries the level into a
// silently pre-staged persona instance. Harness mirrors simli-stop.
import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SimliAvatar, { type SimliAvatarHandle } from '@/components/SimliAvatar';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), start: vi.fn(), send: vi.fn(), events: new Map<string, () => void>() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class {
  constructor(_token: string, video: HTMLVideoElement, audio: HTMLAudioElement) {
    audio.muted = false;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 512 });
    audio.srcObject = {} as MediaStream;
    audio.play = vi.fn().mockResolvedValue(undefined);
  }
  on(event: string, callback: () => void) { mocks.events.set(event, callback); } start = mocks.start; stop = async () => {}; sendAudioData = mocks.send; ClearBuffer() {}
} }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {}, SARA_CHROMA_KEY_PROFILE: { low: 0.16, high: 0.26 } }));
const avatar = { provider: 'simli' as const, enabled: true, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };

describe('in-panel speaker volume — paired (Simli) path', () => {
  it('drives the element volume live and unmute restores the chosen level, not unity', async () => {
    mocks.events.clear();
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockResolvedValue(undefined);
    const ref = createRef<SimliAvatarHandle>();
    const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    await act(async () => { await ref.current?.start(); });
    const audio = view.container.querySelector('audio');
    expect(audio).not.toBeNull();
    if (!audio) return;
    expect(audio.volume).toBe(1);
    act(() => ref.current?.setPlaybackVolume?.(0.35));
    expect(audio.volume).toBeCloseTo(0.35);
    act(() => ref.current?.setPlaybackMuted(true));
    expect(audio.volume).toBe(0);
    act(() => ref.current?.setPlaybackMuted(false));
    expect(audio.volume).toBeCloseTo(0.35);
    act(() => ref.current?.setPlaybackVolume?.(0.9));
    expect(audio.volume).toBeCloseTo(0.9);
    act(() => ref.current?.stop());
  });

  it('a level chosen before start is what the start unmute applies', async () => {
    mocks.events.clear();
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockResolvedValue(undefined);
    const ref = createRef<SimliAvatarHandle>();
    const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    act(() => ref.current?.setPlaybackVolume?.(0.3));
    await act(async () => { await ref.current?.start(); });
    expect(view.container.querySelector('audio')?.volume).toBeCloseTo(0.3);
    act(() => ref.current?.stop());
  });

  it('the cut-over sync carries the session level into a silently staged instance', async () => {
    mocks.events.clear();
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockResolvedValue(undefined);
    const ref = createRef<SimliAvatarHandle>();
    const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed persona="sara" />);
    await act(async () => { await ref.current?.start({ silent: true }); });
    const audio = view.container.querySelector('audio');
    expect(audio).not.toBeNull();
    if (!audio) return;
    expect(audio.volume).toBe(0);
    let live: boolean | undefined;
    await act(async () => { live = await ref.current?.cutoverAudioSync?.({ muted: false, deviceId: null, volume: 0.4 }); });
    expect(live).toBe(true);
    expect(audio.volume).toBeCloseTo(0.4);
    await act(async () => { await ref.current?.cutoverAudioSync?.({ muted: true, deviceId: null, volume: 0.4 }); });
    expect(audio.volume).toBe(0);
    act(() => ref.current?.stop());
  });
});
