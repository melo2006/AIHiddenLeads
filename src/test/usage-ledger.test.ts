// @vitest-environment node
import { expect, test } from 'vitest';
import {
  guardedCostUsd,
  logEmailSend,
  logUsageEvent,
  phoneVoiceEventFromCall,
  videoAvatarEventFromSession,
  webVoiceEventFromSession,
} from '../../supabase/functions/_shared/usage-ledger';
import { aggregateUsage } from '../../supabase/functions/_shared/usage-reporting';

const session = {
  id: 'sess-1',
  organization_id: 'org-1',
  agent_id: 'agent-1',
  duration_seconds: 600,
  started_at: '2026-11-10T15:00:00.000Z',
  created_at: '2026-11-10T14:59:00.000Z',
  config: {},
  usage: { audio_estimate_usd: 1.234 },
};

test('web voice builder maps a finalized session to a ledger event', () => {
  const e = webVoiceEventFromSession(session, session.usage);
  expect(e).toMatchObject({
    organization_id: 'org-1',
    agent_id: 'agent-1',
    service: 'web_voice',
    provider: 'gemini',
    quantity_minutes: 10,
    est_cost_usd: 1.234,
    source_table: 'gemini_voice_sessions',
    source_id: 'sess-1',
    occurred_at: '2026-11-10T15:00:00.000Z',
  });
});

test('web voice builder falls back to session.usage and guards the estimate', () => {
  expect(webVoiceEventFromSession(session).est_cost_usd).toBe(1.234);
  expect(webVoiceEventFromSession({ ...session, usage: { audio_estimate_usd: '0.50' } }).est_cost_usd).toBe(0.5);
  expect(webVoiceEventFromSession({ ...session, usage: { audio_estimate_usd: 'n/a' } }).est_cost_usd).toBeNull();
  expect(webVoiceEventFromSession({ ...session, usage: null }).est_cost_usd).toBeNull();
  expect(webVoiceEventFromSession({ ...session, usage: undefined }).est_cost_usd).toBeNull();
});

test('guardedCostUsd accepts numbers and numeric strings only', () => {
  expect(guardedCostUsd(2.5)).toBe(2.5);
  expect(guardedCostUsd('2.50')).toBe(2.5);
  expect(guardedCostUsd('')).toBeNull();
  expect(guardedCostUsd('1,000')).toBeNull();
  expect(guardedCostUsd(Number.NaN)).toBeNull();
  expect(guardedCostUsd(null)).toBeNull();
  expect(guardedCostUsd({})).toBeNull();
});

test('video avatar builder fires only when the avatar was enabled', () => {
  const on = videoAvatarEventFromSession({ ...session, config: { videoAvatar: { enabled: true } } });
  expect(on).toMatchObject({ service: 'video_avatar', provider: 'simli', quantity_minutes: 10, est_cost_usd: null, source_id: 'sess-1' });
  expect(videoAvatarEventFromSession({ ...session, config: { videoAvatar: { enabled: false } } })).toBeNull();
  expect(videoAvatarEventFromSession({ ...session, config: {} })).toBeNull();
  expect(videoAvatarEventFromSession(session)).toBeNull();
});

const client = { id: 'client-1', organization_id: 'org-9', agent_id: 'agent-9', voice_number: '+18775550100' };

test('phone voice builder maps transport to provider like the backfill CASE', () => {
  const base = { id: 'call-1', client_id: 'client-1', seconds: 180, started_at: '2026-11-10T16:00:00.000Z', ai_usage: { audio_estimate_usd: 0.42 } };
  expect(phoneVoiceEventFromCall({ ...base, transport: 'telnyx-stream' }, client)).toMatchObject({
    service: 'phone_voice', provider: 'telnyx', quantity_minutes: 3, est_cost_usd: 0.42,
    organization_id: 'org-9', telephony_client_id: 'client-1', line_number: '+18775550100',
    source_table: 'telephony_calls', source_id: 'call-1', occurred_at: '2026-11-10T16:00:00.000Z',
  });
  expect(phoneVoiceEventFromCall({ ...base, transport: 'stream' }, client).provider).toBe('twilio');
  expect(phoneVoiceEventFromCall({ ...base, transport: 'webhook' }, client).provider).toBe('other');
  expect(phoneVoiceEventFromCall({ ...base, transport: undefined }, client).provider).toBe('other');
});

test('phone voice builder tolerates a missing ai_usage and missing client', () => {
  const e = phoneVoiceEventFromCall({ id: 'call-2', client_id: 'client-1', seconds: 60, transport: 'stream', started_at: '2026-11-10T16:00:00.000Z' }, null);
  expect(e.est_cost_usd).toBeNull();
  expect(e.organization_id).toBeNull();
  expect(e.line_number).toBeNull();
  expect(e.telephony_client_id).toBe('client-1');
});

test('logUsageEvent upserts with ignore-duplicates and never throws', async () => {
  const seen: any[] = [];
  const okDb = { from: () => ({ upsert: async (row: any, opts: any) => { seen.push({ row, opts }); return { error: null }; } }) };
  await logUsageEvent(okDb, webVoiceEventFromSession(session, session.usage));
  expect(seen).toHaveLength(1);
  expect(seen[0].opts).toEqual({ onConflict: 'service,source_table,source_id', ignoreDuplicates: true });
  expect(seen[0].row.service).toBe('web_voice');

  const errDb = { from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) };
  await expect(logUsageEvent(errDb, webVoiceEventFromSession(session))).resolves.toBeUndefined();
  const throwDb = { from: () => { throw new Error('no table'); } };
  await expect(logUsageEvent(throwDb, webVoiceEventFromSession(session))).resolves.toBeUndefined();
  await expect(logUsageEvent(null, webVoiceEventFromSession(session))).resolves.toBeUndefined();
});

test('logEmailSend builds an email event with the caller-provided source id', async () => {
  const seen: any[] = [];
  const db = { from: () => ({ upsert: async (row: any) => { seen.push(row); return { error: null }; } }) };
  await logEmailSend(db, { to: 'owner@example.com', subject: 'Report' }, { organizationId: 'org-1', sourceTable: 'usage_reports', sourceId: 'settings-1:2026-10' });
  expect(seen[0]).toMatchObject({ service: 'email', provider: 'hostinger', quantity_count: 1, organization_id: 'org-1', source_table: 'usage_reports', source_id: 'settings-1:2026-10' });
});

// Math fixture (NOT live data): the November backfill shape — 312 ended web
// sessions whose durations sum to 18,734 seconds. Builder minutes are
// duration_seconds/60 per event, so the aggregate voice total must come back
// at 18,734/60 = 312.23 minutes.
test('backfill fixture: 312 builder events summing 18,734s aggregate to 312.23 minutes', () => {
  const durations = [...Array(311).fill(60), 74];
  expect(durations.reduce((a, b) => a + b, 0)).toBe(18734);
  const events = durations.map((duration_seconds, i) => webVoiceEventFromSession({
    ...session,
    id: `sess-${i}`,
    duration_seconds,
    usage: null,
  }));
  const totals = aggregateUsage(events);
  expect(totals.eventCount).toBe(312);
  expect(Math.abs(totals.totalVoiceMinutes - 312.23)).toBeLessThan(0.01);
  expect(Math.abs((totals.byService.web_voice?.minutes ?? 0) - 312.23)).toBeLessThan(0.01);
});
