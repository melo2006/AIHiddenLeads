import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SimliAvatar, { type SimliAvatarHandle } from '@/components/SimliAvatar';

// Paired-audio guard (2026-11-10): cutoverAudioSync must FAIL LOUDLY
// on a dead face. It used to unlock the elements and return silently,
// so executeSwap completed a cut-over onto a face that could never
// speak. Now it resolves false when the instance is not live (and
// activate does the same), and true only when a live stream actually
// plays — executeSwap aborts the swap on false while the outgoing
// persona's socket is still open.
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), start: vi.fn(), events: new Map<string, () => void>() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class {
  constructor(_token: string, video: HTMLVideoElement, audio: HTMLAudioElement) {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 512 });
    audio.srcObject = {} as MediaStream;
    audio.play = vi.fn().mockResolvedValue(undefined);
  }
  on(event: string, callback: () => void) { mocks.events.set(event, callback); } start = mocks.start; stop = async () => {}; sendAudioData = vi.fn(); ClearBuffer() {}
} }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {} }));
const avatar = { provider: 'simli' as const, enabled: true, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };

describe('cutover liveness signal', () => {
  it('a never-started (dead) face resolves false from both cutoverAudioSync and activate', async () => {
    const ref = createRef<SimliAvatarHandle>();
    render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    await act(async () => {
      expect(await ref.current?.cutoverAudioSync?.({ muted: false, deviceId: null })).toBe(false);
      expect(await ref.current?.activate()).toBe(false);
    });
    act(() => ref.current?.stop());
  });

  it('a live face resolves true from cutoverAudioSync', async () => {
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockResolvedValue(undefined);
    const ref = createRef<SimliAvatarHandle>();
    render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    await act(async () => { await ref.current?.start({ silent: true }); });
    await act(async () => {
      expect(await ref.current?.cutoverAudioSync?.({ muted: false, deviceId: null })).toBe(true);
    });
    act(() => ref.current?.stop());
  });

  it('a face that dies after starting resolves false again (the stale-latch case)', async () => {
    mocks.events.clear();
    mocks.invoke.mockResolvedValue({ data: { sessionToken: 'test', chromaKey: true } });
    mocks.start.mockResolvedValue(undefined);
    const ref = createRef<SimliAvatarHandle>();
    render(<SimliAvatar ref={ref} avatar={avatar} inline unboxed />);
    await act(async () => { await ref.current?.start({ silent: true }); });
    // Provider error: the client handler marks the face not-live.
    act(() => { mocks.events.get('error')?.(); });
    await act(async () => {
      expect(await ref.current?.cutoverAudioSync?.({ muted: false, deviceId: null })).toBe(false);
    });
    act(() => ref.current?.stop());
  });
});
