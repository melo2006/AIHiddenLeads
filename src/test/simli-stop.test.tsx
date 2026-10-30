import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SimliAvatar, { type SimliAvatarHandle } from '@/components/SimliAvatar';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), start: vi.fn(), send: vi.fn(), events: new Map<string, () => void>() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class {
  constructor(_token: string, _video: HTMLVideoElement, audio: HTMLAudioElement) {
    // Reproduce LiveKit's attachment behavior: a remote audio track unmutes.
    audio.muted = false;
  }
  on(event: string, callback: () => void) { mocks.events.set(event, callback); } start = mocks.start; stop = async () => {}; sendAudioData = mocks.send; ClearBuffer() {}
} }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {} }));
const avatar = { provider: 'simli' as const, enabled: true, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };
describe('intentional avatar stop', () => {
  it('sends lip audio after provider readiness without waiting for a displayed frame', async () => {
    mocks.send.mockClear(); mocks.events.clear();
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    let finish: (() => void) | undefined;
    mocks.start.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const ref = createRef<SimliAvatarHandle>();
    render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    let starting: Promise<boolean> | undefined;
    act(() => { starting = ref.current?.start(); });
    await waitFor(() => expect(mocks.events.has('silent')).toBe(true));
    const chunk = btoa(String.fromCharCode(...new Uint8Array(12000)));
    expect(ref.current?.sendPcm24k(chunk)).toBe(false);
    act(() => mocks.events.get('silent')?.());
    expect(ref.current?.sendPcm24k(chunk)).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await act(async () => { finish?.(); await starting; });
    act(() => ref.current?.stop());
  });
  it('flushes small lip chunks within 80ms even when more chunks keep arriving', async () => {
    mocks.send.mockClear();
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockResolvedValue(undefined);
    const ref = createRef<SimliAvatarHandle>();
    render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    await act(async () => { await ref.current?.start(); });
    vi.useFakeTimers();
    try {
      const chunk = btoa(String.fromCharCode(...new Uint8Array(600)));
      ref.current?.sendPcm24k(chunk);
      await vi.advanceTimersByTimeAsync(40);
      ref.current?.sendPcm24k(chunk);
      await vi.advanceTimersByTimeAsync(40);
      expect(mocks.send).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); act(() => ref.current?.stop()); }
  });
  it('keeps remote audio inaudible even when the provider unmutes its track', async () => {
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockResolvedValue(undefined);
    const ref = createRef<SimliAvatarHandle>();
    const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    await act(async () => { await ref.current?.start(); });
    const audio = view.container.querySelector('audio');
    expect(audio).not.toBeNull();
    if (!audio) return;
    audio.muted = false;
    expect(audio.volume).toBe(0);
    act(() => ref.current?.stop());
  });
  it('retains the keyed frame and does not report a failure on deliberate stop', async () => {
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockResolvedValue(undefined);
    const ref = createRef<SimliAvatarHandle>();
    const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    await act(async () => { await ref.current?.start(); });
    act(() => ref.current?.stop());
    expect(view.queryByRole('status')).toBeNull();
    expect(view.getByRole('img', { name: 'Video avatar' }).className).not.toContain('hidden');
    expect(view.container.querySelector('canvas')?.className).not.toContain('hidden');
    act(() => ref.current?.stop());
    expect(view.getByRole('img', { name: 'Video avatar' }).className).not.toContain('hidden');
    expect(view.container.querySelector('canvas')?.className).not.toContain('hidden');
  });
  it('ignores a late connection rejection after the user stops', async () => {
    let reject: ((e: Error) => void) | undefined;
    mocks.invoke.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    const ref = createRef<SimliAvatarHandle>();
    const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    let starting: Promise<boolean> | undefined;
    act(() => { starting = ref.current?.start(); });
    await waitFor(() => expect(reject).toBeTypeOf('function'));
    act(() => ref.current?.stop());
    await act(async () => { reject?.(new Error('Late network error')); await starting; });
    expect(view.queryByRole('status')).toBeNull();
  });
});