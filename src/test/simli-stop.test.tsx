import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SimliAvatar, { type SimliAvatarHandle } from '@/components/SimliAvatar';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), start: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class {
  on() {} start = mocks.start; stop = async () => {}; sendAudioData() {} ClearBuffer() {}
} }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {} }));
const avatar = { enabled: true, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };
describe('intentional avatar stop', () => {
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