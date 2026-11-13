// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  aggregateUsage, bucketize, computeMinuteBalance, monthKeyFor, packBalance, presetRange, sampleUsageEvents,
  thresholdPct, thresholdState, usageEventsToCsv, PLAN_ALLOWANCES, MINUTE_PACKS,
  type UsageEvent,
} from '@/lib/usageReporting';

let seq = 0;
function ev(partial: Partial<UsageEvent>): UsageEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    organization_id: 'org-1',
    agent_id: null,
    telephony_client_id: null,
    service: 'web_voice',
    provider: 'gemini',
    line_number: null,
    quantity_minutes: null,
    quantity_count: null,
    est_cost_usd: null,
    carrier_cost_usd: null,
    source_table: 'test',
    source_id: `s${seq}`,
    occurred_at: '2026-11-10T10:00:00.000Z',
    created_at: '2026-11-10T10:00:00.000Z',
    ...partial,
  };
}

describe('bucketize', () => {
  test('day buckets stack minutes per service (UTC)', () => {
    const rows = bucketize([
      ev({ service: 'web_voice', quantity_minutes: 10, occurred_at: '2026-11-10T23:30:00.000Z' }),
      ev({ service: 'phone_voice', quantity_minutes: 5, occurred_at: '2026-11-10T01:00:00.000Z' }),
      ev({ service: 'web_voice', quantity_minutes: 2.5, occurred_at: '2026-11-11T00:30:00.000Z' }),
      ev({ service: 'sms', quantity_count: 4, occurred_at: '2026-11-11T02:00:00.000Z' }),
    ], 'day');
    expect(rows.map((r) => r.bucket)).toEqual(['2026-11-10', '2026-11-11']);
    expect(rows[0].web_voice).toBe(10);
    expect(rows[0].phone_voice).toBe(5);
    expect(rows[0].total).toBe(15);
    expect(rows[1].web_voice).toBe(2.5);
    expect(rows[1].sms).toBe(0); // count-based services contribute no minutes
    expect(rows[1].total).toBe(2.5);
  });

  test('week buckets start on ISO Monday (UTC): Sunday belongs to the previous Monday', () => {
    // 2026-11-08 is a Sunday; 2026-11-09 and 2026-11-11 share Monday 2026-11-09.
    const rows = bucketize([
      ev({ service: 'web_voice', quantity_minutes: 10, occurred_at: '2026-11-08T12:00:00.000Z' }),
      ev({ service: 'web_voice', quantity_minutes: 5, occurred_at: '2026-11-09T00:00:00.000Z' }),
      ev({ service: 'phone_voice', quantity_minutes: 1, occurred_at: '2026-11-11T12:00:00.000Z' }),
    ], 'week');
    expect(rows.map((r) => r.bucket)).toEqual(['2026-11-02', '2026-11-09']);
    expect(rows[0].total).toBe(10);
    expect(rows[1].web_voice).toBe(5);
    expect(rows[1].phone_voice).toBe(1);
    expect(rows[1].total).toBe(6);
  });
});

describe('aggregateUsage', () => {
  test('exact sums, carrier cost kept separate, voice total is web+phone only', () => {
    const agg = aggregateUsage([
      ev({ service: 'web_voice', quantity_minutes: 10, est_cost_usd: 0.5 }),
      ev({ service: 'phone_voice', quantity_minutes: 20, est_cost_usd: 1, carrier_cost_usd: 0.25 }),
      ev({ service: 'sms', quantity_count: 7, est_cost_usd: 0.1, carrier_cost_usd: 0.05 }),
      ev({ service: 'video_avatar', quantity_minutes: 30, est_cost_usd: 2 }),
    ]);
    expect(agg.totals.voiceMinutes).toBe(30); // video minutes do NOT count
    expect(agg.totals.minutes).toBe(60);
    expect(agg.totals.events).toBe(4);
    expect(agg.totals.estCostUsd).toBeCloseTo(3.6);
    expect(agg.totals.carrierCostUsd).toBeCloseTo(0.3);
    expect(agg.byService.sms.count).toBe(7);
    expect(agg.byService.sms.minutes).toBe(0);
    expect(agg.byService.phone_voice.carrierCostUsd).toBeCloseTo(0.25);
    expect(agg.byService.web_voice.carrierCostUsd).toBe(0);
    expect(agg.byService.web_voice.estCostUsd).toBeCloseTo(0.5);
  });
});

describe('computeMinuteBalance', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');
  const events = [
    // Current month (Nov): 120 voice minutes; non-voice minutes never count.
    ev({ service: 'web_voice', quantity_minutes: 100, occurred_at: '2026-11-03T10:00:00.000Z' }),
    ev({ service: 'phone_voice', quantity_minutes: 20, occurred_at: '2026-11-05T10:00:00.000Z' }),
    ev({ service: 'chat_brain', quantity_minutes: 999, occurred_at: '2026-11-05T10:00:00.000Z' }),
    // Oct: 300 used -> 100 banked. Sep: 450 used -> 0. Aug: 100 used -> 300
    // banked (month-end Sep 1 is 75 days before Nov 15). Jul: 0 used but its
    // month-end (Aug 1) is 106 days out -> expired, banks nothing.
    ev({ service: 'web_voice', quantity_minutes: 300, occurred_at: '2026-10-10T10:00:00.000Z' }),
    ev({ service: 'web_voice', quantity_minutes: 450, occurred_at: '2026-09-10T10:00:00.000Z' }),
    ev({ service: 'web_voice', quantity_minutes: 100, occurred_at: '2026-08-10T10:00:00.000Z' }),
  ];

  test('allowance 400: bank sums unused prior months inside 90 days, current month excluded', () => {
    const bal = computeMinuteBalance({ allowanceMinutes: 400, events, now, subscriptionActive: true });
    expect(bal.usedThisMonth).toBe(120);
    expect(bal.bankedMinutes).toBe(400); // 100 (Oct) + 0 (Sep) + 300 (Aug); NOT Nov's unused 280
    expect(bal.remainingThisMonth).toBe(680); // 400 + 400 - 120
  });

  test('banked minutes expire after 90 days', () => {
    const later = new Date('2026-12-15T12:00:00.000Z');
    const bal = computeMinuteBalance({ allowanceMinutes: 400, events, now: later, subscriptionActive: true });
    expect(bal.usedThisMonth).toBe(0); // December has no events in the fixture
    // Sep month-end (Oct 1) is 75 days out -> 0 banked (450 used);
    // Oct month-end (Nov 1) is 44 days out -> 100; Nov (120 used) -> 280.
    // Aug has expired (month-end Sep 1 is 105 days out).
    expect(bal.bankedMinutes).toBe(380);
  });

  test('inactive subscription forfeits the bank', () => {
    const bal = computeMinuteBalance({ allowanceMinutes: 400, events, now, subscriptionActive: false });
    expect(bal.bankedMinutes).toBe(0);
    expect(bal.usedThisMonth).toBe(120);
    expect(bal.remainingThisMonth).toBe(280);
  });
});

describe('packBalance', () => {
  test('only paid/paid_test packs inside 90 days count', () => {
    const now = new Date('2026-11-15T12:00:00.000Z');
    const total = packBalance([
      { minutes: 100, status: 'paid', created_at: '2026-11-01T00:00:00.000Z' },
      { minutes: 300, status: 'paid_test', created_at: '2026-08-20T00:00:00.000Z' }, // 87 days old
      { minutes: 500, status: 'pending', created_at: '2026-11-01T00:00:00.000Z' },
      { minutes: 500, status: 'paid', created_at: '2026-08-01T00:00:00.000Z' }, // 106 days old: expired
      { minutes: 100, status: 'refunded', created_at: '2026-11-01T00:00:00.000Z' },
      { minutes: 100, status: 'failed', created_at: '2026-11-01T00:00:00.000Z' },
    ], now);
    expect(total).toBe(400);
  });
});

describe('thresholds', () => {
  test('boundaries at 79.9 / 80 / 99.9 / 100 percent', () => {
    expect(thresholdPct(319.6, 400)).toBeCloseTo(79.9);
    expect(thresholdState(319.6, 400)).toBe('ok');
    expect(thresholdState(320, 400)).toBe('warn80');
    expect(thresholdState(399.6, 400)).toBe('warn80');
    expect(thresholdState(400, 400)).toBe('over100');
    expect(thresholdState(10, 0)).toBe('ok');
    expect(thresholdPct(10, 0)).toBe(0);
  });
});

describe('usageEventsToCsv', () => {
  test('header row plus formula-neutralized cells via csvCell', () => {
    const csv = usageEventsToCsv([
      ev({ organization_id: 'org-9', service: 'sms', provider: 'twilio', quantity_count: 3, occurred_at: '2026-11-10T10:00:00.000Z' }),
      ev({ organization_id: null, service: 'chat_brain', provider: 'other', quantity_count: 1 }),
    ], { 'org-9': '=Evil Corp' });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"occurred_at","organization","service","provider","line_number","quantity_minutes","quantity_count","est_cost_usd","carrier_cost_usd","source_table","source_id","id"');
    // A business name starting with '=' is apostrophe-prefixed inside the quotes.
    expect(lines[1]).toContain(`"'=Evil Corp"`);
    expect(lines[1]).toContain('"Text messages"');
    expect(lines[2]).toContain('"Unattributed"');
  });
});

describe('presetRange (UTC)', () => {
  const now = new Date('2026-11-15T12:34:56.000Z');
  test('month starts on the 1st at 00:00 UTC', () => {
    const r = presetRange('month', now);
    expect(r.from.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe(now.toISOString());
  });
  test('today starts at 00:00 UTC', () => {
    const r = presetRange('today', now);
    expect(r.from.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(r.to.toISOString()).toBe(now.toISOString());
  });
  test('7d / 30d are rolling windows ending at now', () => {
    expect(presetRange('7d', now).from.toISOString()).toBe('2026-11-08T12:34:56.000Z');
    expect(presetRange('30d', now).from.toISOString()).toBe('2026-10-16T12:34:56.000Z');
  });
  test('custom dates are UTC days, end-of-day inclusive', () => {
    const r = presetRange('custom', now, { from: '2026-10-03', to: '2026-10-05' });
    expect(r.from.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-05T23:59:59.999Z');
  });
});

describe('sampleUsageEvents (client-side preview only)', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');
  const sample = sampleUsageEvents({ organizationId: 'org-1', allowanceMinutes: 400, now });

  test('deterministic: same inputs produce identical output', () => {
    expect(sampleUsageEvents({ organizationId: 'org-1', allowanceMinutes: 400, now })).toEqual(sample);
  });

  test('rich current month: dozens of phone + web events plus a few SMS/email, all sample-marked', () => {
    const thisMonth = sample.filter((e) => monthKeyFor(e.occurred_at) === '2026-11');
    const byService = (s: string) => thisMonth.filter((e) => e.service === s).length;
    expect(byService('phone_voice')).toBe(38);
    expect(byService('web_voice')).toBe(16);
    expect(byService('sms')).toBe(5);
    expect(byService('email')).toBe(4);
    expect(byService('video_avatar')).toBe(6);
    expect(thisMonth.length).toBe(69);
    expect(sample.every((e) => e.id.startsWith('sample-') && e.source_table === 'sample_preview')).toBe(true);
    expect(sample.every((e) => e.occurred_at <= now.toISOString())).toBe(true);
  });

  test('current-month voice usage lands near 62% of the real allowance; bank stays plausible', () => {
    const bal = computeMinuteBalance({ allowanceMinutes: 400, events: sample, now, subscriptionActive: true });
    expect(bal.usedThisMonth).toBeGreaterThan(200);
    expect(bal.usedThisMonth).toBeLessThan(300);
    // Prior sample months used 55% / 45% / 50% of the allowance, so the
    // bank is (45% + 55% + 50%) × 400 = 600, give or take rounding.
    expect(bal.bankedMinutes).toBeGreaterThan(540);
    expect(bal.bankedMinutes).toBeLessThan(660);
  });

  test('chart buckets build from the sample set through the same bucketize path', () => {
    const thisMonth = sample.filter((e) => monthKeyFor(e.occurred_at) === '2026-11');
    const buckets = bucketize(thisMonth, 'day');
    expect(buckets.length).toBeGreaterThan(5);
    expect(buckets.reduce((n, b) => n + b.total, 0)).toBeGreaterThan(200);
  });
});

describe('catalogs mirror the backend', () => {
  test('plan allowances and voice packs match PLAN_ALLOWANCES / MINUTE_PACKS', () => {
    expect(PLAN_ALLOWANCES.essentials_monthly).toEqual({ name: 'Premium', monthlyUsd: 99, minutes: 400 });
    expect(PLAN_ALLOWANCES.growth_monthly).toEqual({ name: 'Professional', monthlyUsd: 199, minutes: 1200 });
    expect(PLAN_ALLOWANCES.fullservice_monthly).toEqual({ name: 'Platinum', monthlyUsd: 349, minutes: 2500 });
    expect(MINUTE_PACKS.map((p) => [p.id, p.minutes, p.priceCents])).toEqual([
      ['voice_100', 100, 2000],
      ['voice_300', 300, 5400],
      ['voice_500', 500, 8500],
      ['voice_1000', 1000, 15000],
    ]);
    expect(MINUTE_PACKS.every((p) => p.kind === 'voice')).toBe(true);
  });
});
