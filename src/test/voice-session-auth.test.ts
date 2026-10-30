// @vitest-environment node
import { expect, test, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {} } }));
import { voiceSessionHeaders } from '@/lib/voiceSessionAuth';

test('reopened demo waits for restored sign-in and sends its token', async () => {
  let restore: ((value: { data: { session: { access_token: string } }; error: null }) => void) | undefined;
  const restored = new Promise<{ data: { session: { access_token: string } }; error: null }>(resolve => { restore = resolve; });
  let finished = false;
  const pending = voiceSessionHeaders({ getSession: () => restored }).then(headers => { finished = true; return headers; });
  await Promise.resolve();
  expect(finished).toBe(false);
  restore?.({ data: { session: { access_token: 'test-restored-token' } }, error: null });
  expect(await pending).toEqual({ Authorization: 'Bearer test-restored-token' });
});

test('signed-out visitors receive no administrator identity header', async () => {
  expect(await voiceSessionHeaders({ getSession: async () => ({ data: { session: null }, error: null }) })).toBeUndefined();
});

test('failed sign-in restoration does not silently downgrade to visitor usage', async () => {
  await expect(voiceSessionHeaders({ getSession: async () => ({ data: { session: null }, error: new Error('refresh failed') }) })).rejects.toThrow('sign-in could not be restored');
});

test('each new start rereads sign-in so logout cannot reuse the previous token', async () => {
  const getSession = vi.fn()
    .mockResolvedValueOnce({ data: { session: { access_token: 'test-signed-in-token' } }, error: null })
    .mockResolvedValueOnce({ data: { session: null }, error: null });
  expect(await voiceSessionHeaders({ getSession })).toEqual({ Authorization: 'Bearer test-signed-in-token' });
  expect(await voiceSessionHeaders({ getSession })).toBeUndefined();
});