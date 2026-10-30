import { describe, expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class {} }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {} }));
import { FunctionsHttpError } from '@supabase/supabase-js';
import { sessionToken, VIDEO_SLOW } from '@/components/SimliAvatar';

const httpError = (status: number, error: string) => new FunctionsHttpError(new Response(JSON.stringify({ error }), { status }));

describe('video token request', () => {
  beforeEach(() => mocks.invoke.mockReset());
  it('retries once when the first request is aborted or dropped', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('signal is aborted without reason') })
      .mockResolvedValueOnce({ data: { sessionToken: 'ok', chromaKey: true }, error: null });
    await expect(sessionToken({})).resolves.toEqual({ token: 'ok', chromaKey: true });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it('shows a retry message instead of a bare failure after two slow attempts', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('aborted') });
    await expect(sessionToken({})).rejects.toThrow(VIDEO_SLOW);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
  it('does not retry a refusal such as a disabled avatar', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(404, 'Video avatar is not enabled') });
    await expect(sessionToken({})).rejects.toThrow('Video avatar is not enabled');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
