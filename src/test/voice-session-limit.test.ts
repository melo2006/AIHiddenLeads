// @vitest-environment node
import { expect, test } from 'vitest';
import { voiceQuotaClass, voiceLimitResponse } from '../../supabase/functions/_shared/voice-session-limit';

test('anonymous calls retain the visitor allowance', () => expect(voiceQuotaClass(false, false)).toBe('visitor'));
test('verified administrators use the testing allowance', () => expect(voiceQuotaClass(true, false)).toBe('admin_test'));
test('authorized auditions are separate from visitor conversations', () => expect(voiceQuotaClass(false, true)).toBe('audition'));
test('visitor limit resets at the next midnight UTC', () => {
  const result = voiceLimitResponse('Your daily voice limit has been reached', new Date('2026-10-24T07:35:00Z'));
  expect(result?.allowed).toBe(false);
  expect(result?.code).toBe('VISITOR_DAILY_LIMIT');
  expect(result?.resetsAt).toBe('2026-10-25T00:00:00.000Z');
});
test('site limit remains enforced for tests', () => expect(voiceLimitResponse('Daily voice limit reached')?.code).toBe('SITE_DAILY_LIMIT'));
test('database failures are not misreported as limits', () => expect(voiceLimitResponse('permission denied')).toBeNull());