// @vitest-environment node
import { expect, test } from 'vitest';
import {
  PLAN_ALLOWANCES,
  aggregateUsage,
  alertText,
  computeMinuteBalance,
  lastCompletedPeriodKey,
  periodKeyFor,
  renderUsageReportHtml,
  renderUsageReportText,
  reportPeriodRange,
  thresholdCrossings,
} from '../../supabase/functions/_shared/usage-reporting';
import { MINUTE_PACKS, validMinutePack } from '../../supabase/functions/_shared/payment-rules';

test('plan allowances match the published plans', () => {
  expect(PLAN_ALLOWANCES).toEqual({
    essentials_monthly: { name: 'Premium', monthlyUsd: 99, minutes: 400 },
    growth_monthly: { name: 'Professional', monthlyUsd: 199, minutes: 1200 },
    fullservice_monthly: { name: 'Platinum', monthlyUsd: 349, minutes: 2500 },
  });
});

test('period keys: daily, ISO week (Monday start, UTC) and monthly', () => {
  const thu = new Date('2026-11-12T15:00:00.000Z'); // Thursday
  expect(periodKeyFor(thu, 'daily')).toBe('2026-11-12');
  expect(periodKeyFor(thu, 'monthly')).toBe('2026-11');
  expect(periodKeyFor(thu, 'weekly')).toBe('2026-W46');
  // Sunday belongs to the same ISO week as the preceding Monday.
  expect(periodKeyFor(new Date('2026-11-15T23:00:00.000Z'), 'weekly')).toBe('2026-W46');
  expect(periodKeyFor(new Date('2026-11-16T00:00:00.000Z'), 'weekly')).toBe('2026-W47');
});

test('period ranges are half-open UTC intervals', () => {
  const week = reportPeriodRange('2026-W46', 'weekly');
  expect(week.startIso).toBe('2026-11-09T00:00:00.000Z');
  expect(week.endIso).toBe('2026-11-16T00:00:00.000Z');
  const month = reportPeriodRange('2026-11', 'monthly');
  expect(month.startIso).toBe('2026-11-01T00:00:00.000Z');
  expect(month.endIso).toBe('2026-12-01T00:00:00.000Z');
  const day = reportPeriodRange('2026-11-12', 'daily');
  expect(day.startIso).toBe('2026-11-12T00:00:00.000Z');
  expect(day.endIso).toBe('2026-11-13T00:00:00.000Z');
  // Round-trip: a date inside the range keys back to the same period.
  expect(periodKeyFor(week.start, 'weekly')).toBe('2026-W46');
});

test('last completed period: yesterday, last ISO week, last month', () => {
  const now = new Date('2026-11-12T15:00:00.000Z');
  expect(lastCompletedPeriodKey('daily', now)).toBe('2026-11-11');
  expect(lastCompletedPeriodKey('weekly', now)).toBe('2026-W45');
  expect(lastCompletedPeriodKey('monthly', now)).toBe('2026-10');
});

const fixtureEvents = [
  { service: 'web_voice', quantity_minutes: 10, quantity_count: null, est_cost_usd: 0.5, occurred_at: '2026-11-05T10:00:00.000Z' },
  { service: 'web_voice', quantity_minutes: 5, quantity_count: null, est_cost_usd: 0.25, occurred_at: '2026-11-06T10:00:00.000Z' },
  { service: 'phone_voice', quantity_minutes: 3, quantity_count: null, est_cost_usd: 0.1, occurred_at: '2026-11-06T11:00:00.000Z' },
  { service: 'sms', quantity_minutes: null, quantity_count: 4, est_cost_usd: 0.03, occurred_at: '2026-11-06T12:00:00.000Z' },
  { service: 'email', quantity_minutes: null, quantity_count: 2, est_cost_usd: null, occurred_at: '2026-11-07T12:00:00.000Z' },
  { service: 'video_avatar', quantity_minutes: 10, quantity_count: null, est_cost_usd: null, occurred_at: '2026-11-07T12:00:00.000Z' },
  // Outside the November range below — must be filtered out.
  { service: 'web_voice', quantity_minutes: 99, quantity_count: null, est_cost_usd: 9, occurred_at: '2026-10-31T23:00:00.000Z' },
];

test('aggregateUsage sums per service and counts only web+phone as voice minutes', () => {
  const range = reportPeriodRange('2026-11', 'monthly');
  const totals = aggregateUsage(fixtureEvents, range);
  expect(totals.eventCount).toBe(6);
  expect(totals.totalVoiceMinutes).toBe(18); // 10 + 5 + 3; video_avatar minutes excluded
  expect(totals.byService.web_voice).toMatchObject({ minutes: 15, events: 2, estCostUsd: 0.75 });
  expect(totals.byService.phone_voice).toMatchObject({ minutes: 3, events: 1 });
  expect(totals.byService.sms).toMatchObject({ count: 4, estCostUsd: 0.03 });
  expect(totals.byService.email).toMatchObject({ count: 2 });
  expect(totals.totalEstCostUsd).toBeCloseTo(0.88, 6);
});

test('aggregateUsage without a range includes everything', () => {
  const totals = aggregateUsage(fixtureEvents);
  expect(totals.eventCount).toBe(7);
  expect(totals.totalVoiceMinutes).toBe(117);
});

test('computeMinuteBalance banks unused allowance from the last 3 months', () => {
  const balance = computeMinuteBalance({
    allowanceMinutes: 400,
    eventsByMonth: { '2026-11': 150, '2026-10': 300, '2026-09': 450, '2026-08': 100 },
    currentMonthKey: '2026-11',
    subscriptionActive: true,
    now: new Date('2026-11-12T12:00:00.000Z'),
  });
  // Oct banks 100, Sep banks 0 (over-used), Aug banks 300.
  expect(balance.bankedMinutes).toBe(400);
  expect(balance.currentUsed).toBe(150);
  expect(balance.currentRemaining).toBe(650); // 400 allowance + 400 bank - 150 used
});

test('computeMinuteBalance drops a month whose month-end is over 90 days old', () => {
  const balance = computeMinuteBalance({
    allowanceMinutes: 400,
    eventsByMonth: { '2026-12': 0, '2026-11': 300, '2026-10': 300, '2026-09': 100 },
    currentMonthKey: '2026-12',
    subscriptionActive: true,
    now: new Date('2026-12-31T12:00:00.000Z'),
  });
  // Sep's month-end (Oct 1) is 91 days before Dec 31, so its 300 bankable
  // minutes expire; Nov banks 100 and Oct banks 100.
  expect(balance.bankedMinutes).toBe(200);
});

test('computeMinuteBalance banks nothing while the subscription is inactive', () => {
  const balance = computeMinuteBalance({
    allowanceMinutes: 400,
    eventsByMonth: { '2026-11': 150, '2026-10': 0, '2026-09': 0, '2026-08': 0 },
    currentMonthKey: '2026-11',
    subscriptionActive: false,
    now: new Date('2026-11-12T12:00:00.000Z'),
  });
  expect(balance.bankedMinutes).toBe(0);
  expect(balance.currentUsed).toBe(150);
  expect(balance.currentRemaining).toBe(250);
});

test('thresholdCrossings boundaries at 80% and 100%', () => {
  expect(thresholdCrossings(319.6, 400)).toBe(0); // 79.9%
  expect(thresholdCrossings(320, 400)).toBe(80); // exactly 80%
  expect(thresholdCrossings(396, 400)).toBe(80); // 99%
  expect(thresholdCrossings(400, 400)).toBe(100); // exactly 100%
  expect(thresholdCrossings(640, 400)).toBe(100); // over
  expect(thresholdCrossings(0, 400)).toBe(0);
  expect(thresholdCrossings(100, 0)).toBe(0);
});

const renderInput = {
  orgName: 'Acme Widgets',
  periodLabel: 'October 2026',
  totals: aggregateUsage([
    { service: 'web_voice', quantity_minutes: 140, quantity_count: null, est_cost_usd: 8.5, occurred_at: '2026-10-05T10:00:00.000Z' },
    { service: 'phone_voice', quantity_minutes: 60, quantity_count: null, est_cost_usd: 4, occurred_at: '2026-10-06T10:00:00.000Z' },
    { service: 'sms', quantity_minutes: null, quantity_count: 12, est_cost_usd: 0, occurred_at: '2026-10-06T10:00:00.000Z' },
  ]),
  balance: { allowanceMinutes: 400, bankedMinutes: 50, currentUsed: 200, currentRemaining: 250 },
  dashboardUrl: 'https://aihiddenleads.com/account',
  callsAnswered: 7,
};

test('report HTML and text contain the passed figures', () => {
  const html = renderUsageReportHtml(renderInput);
  expect(html).toContain('Acme Widgets');
  expect(html).toContain('October 2026');
  expect(html).toContain('200'); // voice minutes used
  expect(html).toContain('400'); // allowance
  expect(html).toContain('50%'); // pct of allowance
  expect(html).toContain('$12.50'); // total est. cost
  expect(html).toContain('Calls answered by Aspen');
  expect(html).toContain('>7<'); // calls answered count
  expect(html).toContain('https://aihiddenleads.com/account');

  const text = renderUsageReportText(renderInput);
  expect(text).toContain('Voice minutes used: 200 of 400 (50%)');
  expect(text).toContain('Calls answered by Aspen: 7');
  expect(text).toContain('$12.50');
  expect(text).toContain('https://aihiddenleads.com/account');
});

test('alertText stays within 320 chars and names the percentage', () => {
  const a80 = alertText('usage_threshold_80', 80, 'Acme Widgets');
  expect(a80.length).toBeLessThanOrEqual(320);
  expect(a80).toContain('80%');
  expect(a80).toContain('Acme Widgets');
  const a100 = alertText('usage_threshold_100', 100, 'Acme Widgets');
  expect(a100.length).toBeLessThanOrEqual(320);
  expect(a100).toContain('100%');
});

test('MINUTE_PACKS constants equal the approved prices and minutes', () => {
  expect(MINUTE_PACKS).toEqual({
    voice_100: { minutes: 100, amount: 2000 },
    voice_300: { minutes: 300, amount: 5400 },
    voice_500: { minutes: 500, amount: 8500 },
    voice_1000: { minutes: 1000, amount: 15000 },
  });
  expect(validMinutePack('voice_100')).toBe(true);
  expect(validMinutePack('voice_1000')).toBe(true);
  expect(validMinutePack('video_100')).toBe(false);
  expect(validMinutePack('voice_200')).toBe(false);
  expect(validMinutePack('essentials_monthly')).toBe(false);
  expect(validMinutePack(null)).toBe(false);
  expect(validMinutePack(undefined)).toBe(false);
});
