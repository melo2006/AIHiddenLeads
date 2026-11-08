// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

// The shared schema imports zod via Deno's npm: specifier; map it to the
// repo's installed zod for the test run (same library, same major).
// @ts-ignore: 'npm:' specifiers resolve in Deno, not in the app's tsc.
vi.mock('npm:zod@3', async () => await import('zod'));

import { campaignEventSchema } from '../../supabase/functions/_shared/campaign-events-schema';

const VISIT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD = '11111111-1111-4111-8111-111111111111';

const base = { visitId: VISIT, event: 'voice_started', path: '/demo-site', source: '', campaign: '' };

describe('campaign-events schema', () => {
  test('accepts the legacy payload with no leadId (ad traffic unchanged)', () => {
    const parsed = campaignEventSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.leadId).toBeUndefined();
  });

  test('accepts a well-formed leadId on a public path', () => {
    const parsed = campaignEventSchema.safeParse({ ...base, leadId: LEAD });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.leadId).toBe(LEAD);
  });

  test('rejects a malformed leadId', () => {
    for (const leadId of ['not-a-uuid', '12345', '', 'zzzzzzzz-1111-4111-8111-111111111111']) {
      expect(campaignEventSchema.safeParse({ ...base, leadId }).success).toBe(false);
    }
  });

  test('rejects a null leadId (omitted is the only no-lead form)', () => {
    expect(campaignEventSchema.safeParse({ ...base, leadId: null }).success).toBe(false);
  });

  test('a leadId never unlocks a non-public path', () => {
    const parsed = campaignEventSchema.safeParse({ ...base, path: '/dashboard/voice-agents', leadId: LEAD });
    expect(parsed.success).toBe(false);
  });

  test('section_view still requires a homepage section path, with or without leadId', () => {
    expect(campaignEventSchema.safeParse({ ...base, event: 'section_view', path: '/#pricing', leadId: LEAD }).success).toBe(true);
    expect(campaignEventSchema.safeParse({ ...base, event: 'section_view', path: '/demo-site', leadId: LEAD }).success).toBe(false);
  });
});
