import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SimliAvatar, { type SimliAvatarHandle } from '@/components/SimliAvatar';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), start: vi.fn(), send: vi.fn(), events: new Map<string, () => void>() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class {
  constructor(_token: string, video: HTMLVideoElement, audio: HTMLAudioElement) {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 512 });
    audio.srcObject = {} as MediaStream;
    audio.play = vi.fn().mockResolvedValue(undefined);
  }
  on(event: string, callback: () => void) { mocks.events.set(event, callback); } start = mocks.start; stop = async () => {}; sendAudioData = mocks.send; ClearBuffer() {}
} }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {} }));
const avatar = { provider: 'simli' as const, enabled: true, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };

describe('video startup retry', () => {
  beforeEach(() => { mocks.events.clear(); mocks.invoke.mockReset(); mocks.start.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('retries a stalled connect with a fresh token and goes live', async () => {
    vi.useFakeTimers();
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start
      .mockImplementationOnce(() => new Promise(() => {})) // first attempt stalls past its cap
      .mockResolvedValue(undefined); // the retry connects
    const ref = createRef<SimliAvatarHandle>();
    render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    let starting: Promise<boolean> | undefined;
    act(() => { starting = ref.current?.start(); });
    // Run out the first attempt's 12s connect cap.
    await act(async () => { await vi.advanceTimersByTimeAsync(12000); });
    // Backoff, fresh token, second connect, and the displayed-frame check.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await expect(starting!).resolves.toBe(true);
    expect(mocks.invoke).toHaveBeenCalledTimes(2); // a fresh token per attempt
    expect(mocks.start).toHaveBeenCalledTimes(2);
    act(() => ref.current?.stop());
  });

  it('gives up after the bounded attempts and reports the failure', async () => {
    vi.useFakeTimers();
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockImplementation(() => new Promise(() => {})); // every attempt stalls
    const ref = createRef<SimliAvatarHandle>();
    const view = render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    let outcome: Promise<unknown> | undefined;
    act(() => { outcome = ref.current?.start().catch(error => error); });
    // 12s cap + backoff + 8s cap + backoff + 8s cap (plus slack for the entry frame).
    await act(async () => { await vi.advanceTimersByTimeAsync(12000 + 600 + 8000 + 600 + 8000 + 1000); });
    await expect(outcome!).resolves.toBeInstanceOf(Error);
    expect(mocks.start).toHaveBeenCalledTimes(3); // initial + two retries, no more
    expect(view.getByRole('status').textContent).toContain('did not arrive');
    act(() => ref.current?.stop());
  });
});
