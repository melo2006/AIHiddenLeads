// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  buildOutreachReport,
  leadVisitStats,
  recordedMinutesByLead,
  visitStats,
  type OutreachInviteRow,
  type OutreachLeadRow,
  type OutreachSendRow,
  type OutreachVisitEventRow,
  type OutreachVoiceSessionRow,
} from '../../supabase/functions/_shared/outreach-report';

const LEAD_A = '11111111-1111-4111-8111-111111111111';
const LEAD_B = '22222222-2222-4222-8222-222222222222';
const LEAD_C = '33333333-3333-4333-8333-333333333333';
const VISIT_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VISIT_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const leads: OutreachLeadRow[] = [
  { id: LEAD_A, business_name: 'Durgin Electric', full_name: 'Office Durgin', email: 'office@durginelectric.com', website_url: 'https://durginelectric.com' },
  { id: LEAD_B, business_name: 'Lassiter Electric', full_name: 'HR Lassiter', email: 'hr@lassiterelectric.com', website_url: 'https://lassiterelectric.com' },
  { id: LEAD_C, business_name: 'EC Electric', full_name: 'D Riddle', email: 'driddle@ec-electric.com', website_url: 'https://ec-electric.com' },
];

const sends: OutreachSendRow[] = [
  { lead_id: LEAD_A, campaign: 'assoc-outreach-1', step: 1, sent_at: '2026-11-10T14:00:00Z' },
  { lead_id: LEAD_A, campaign: 'assoc-outreach-1', step: 2, sent_at: '2026-11-12T14:00:00Z' },
  { lead_id: LEAD_B, campaign: 'assoc-outreach-1', step: 1, sent_at: '2026-11-10T14:05:00Z' },
  { lead_id: LEAD_C, campaign: 'assoc-outreach-2', step: 1, sent_at: '2026-11-10T14:10:00Z' },
];

const invites: OutreachInviteRow[] = [
  { lead_id: LEAD_A, campaign: 'assoc-outreach-1', first_opened_at: '2026-11-10T15:00:00Z', last_opened_at: '2026-11-11T09:00:00Z', open_count: 3 },
  { lead_id: LEAD_B, campaign: 'assoc-outreach-1', first_opened_at: null, last_opened_at: null, open_count: 0 },
  { lead_id: LEAD_C, campaign: 'assoc-outreach-2', first_opened_at: '2026-11-10T16:00:00Z', last_opened_at: '2026-11-10T16:00:00Z', open_count: 1 },
];

// Lead A: one visit, voice 15:10 → 15:16 = 6 minutes, finished.
// Lead B: no linked visit events at all.
// Lead C: scan only, no voice.
const events: OutreachVisitEventRow[] = [
  { visit_id: VISIT_1, lead_id: LEAD_A, event: 'page_view', created_at: '2026-11-10T15:09:00Z' },
  { visit_id: VISIT_1, lead_id: LEAD_A, event: 'scan_started', created_at: '2026-11-10T15:09:30Z' },
  { visit_id: VISIT_1, lead_id: LEAD_A, event: 'voice_started', created_at: '2026-11-10T15:10:00Z' },
  { visit_id: VISIT_1, lead_id: LEAD_A, event: 'voice_ended', created_at: '2026-11-10T15:16:00Z' },
  { visit_id: VISIT_2, lead_id: LEAD_C, event: 'page_view', created_at: '2026-11-10T16:01:00Z' },
  { visit_id: VISIT_2, lead_id: LEAD_C, event: 'scan_started', created_at: '2026-11-10T16:01:30Z' },
  // Unlinked ad-traffic noise must never leak into the report.
  { visit_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', lead_id: null, event: 'voice_started', created_at: '2026-11-10T17:00:00Z' },
  { visit_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', lead_id: null, event: 'voice_ended', created_at: '2026-11-10T17:30:00Z' },
];

const sessions: OutreachVoiceSessionRow[] = [
  { lead_id: LEAD_A, duration_seconds: 390 },
  { lead_id: LEAD_A, duration_seconds: 30 },
  { lead_id: LEAD_B, duration_seconds: null },
  { lead_id: null, duration_seconds: 9999 },
];

describe('visitStats minutes derivation', () => {
  test('span runs from first voice_started to last voice_ended', () => {
    const stats = visitStats([
      { visit_id: VISIT_1, lead_id: LEAD_A, event: 'voice_started', created_at: '2026-11-10T15:10:00Z' },
      { visit_id: VISIT_1, lead_id: LEAD_A, event: 'voice_ended', created_at: '2026-11-10T15:12:00Z' },
      // A reconnect inside the same tab extends the span, never double-counts.
      { visit_id: VISIT_1, lead_id: LEAD_A, event: 'voice_started', created_at: '2026-11-10T15:13:00Z' },
      { visit_id: VISIT_1, lead_id: LEAD_A, event: 'voice_ended', created_at: '2026-11-10T15:16:00Z' },
    ]);
    expect(stats).toEqual({ started: true, finished: true, minutes: 6, deepest: 'voice_ended' });
  });

  test('voice start without an end counts as started, zero minutes', () => {
    const stats = visitStats([
      { visit_id: VISIT_1, lead_id: LEAD_A, event: 'voice_started', created_at: '2026-11-10T15:10:00Z' },
    ]);
    expect(stats.started).toBe(true);
    expect(stats.finished).toBe(false);
    expect(stats.minutes).toBe(0);
    expect(stats.deepest).toBe('voice_started');
  });

  test('scan_started alone counts as demo started', () => {
    const stats = visitStats([
      { visit_id: VISIT_2, lead_id: LEAD_C, event: 'scan_started', created_at: '2026-11-10T16:01:30Z' },
    ]);
    expect(stats.started).toBe(true);
    expect(stats.deepest).toBe('scan_started');
  });
});

describe('recordedMinutesByLead', () => {
  test('sums recorded session seconds per lead and ignores null leads/durations', () => {
    const map = recordedMinutesByLead(sessions);
    expect(map.get(LEAD_A)).toBe(7);
    expect(map.has(LEAD_B)).toBe(false);
    expect(map.size).toBe(1);
  });
});

describe('leadVisitStats', () => {
  test('groups by visit then lead and drops unlinked events', () => {
    const map = leadVisitStats(events);
    expect(map.get(LEAD_A)).toEqual({ started: true, finished: true, minutes: 6, deepest: 'voice_ended' });
    expect(map.get(LEAD_C)?.started).toBe(true);
    expect(map.get(LEAD_C)?.minutes).toBe(0);
    expect(map.has(LEAD_B)).toBe(false);
    expect(map.size).toBe(2);
  });
});

describe('buildOutreachReport rollup', () => {
  const report = buildOutreachReport({ sends, invites, events, leads, sessions });
  const c1 = report.campaigns.find(c => c.campaign === 'assoc-outreach-1')!;
  const c2 = report.campaigns.find(c => c.campaign === 'assoc-outreach-2')!;

  test('sent counts sends, prospectsSent counts distinct leads', () => {
    expect(c1.sent).toBe(3);
    expect(c1.prospectsSent).toBe(2);
    expect(c2.sent).toBe(1);
    expect(c2.prospectsSent).toBe(1);
  });

  test('link opens come from invites only — no email-open data exists', () => {
    expect(c1.linkOpened).toBe(1);
    expect(c1.totalOpens).toBe(3);
    expect(c2.linkOpened).toBe(1);
    expect(c2.totalOpens).toBe(1);
    expect(JSON.stringify(report)).not.toContain('emailOpened');
  });

  test('demo started/finished/minutes attribute to the lead campaign', () => {
    expect(c1.demoStarted).toBe(1);
    expect(c1.demoFinished).toBe(1);
    expect(c1.demoMinutes).toBe(6);
    expect(c1.recordedDemoMinutes).toBe(7);
    expect(c2.demoStarted).toBe(1);
    expect(c2.demoFinished).toBe(0);
    expect(c2.demoMinutes).toBe(0);
  });

  test('campaigns sort by sent desc', () => {
    expect(report.campaigns[0].campaign).toBe('assoc-outreach-1');
  });
});

describe('buildOutreachReport per-prospect merge', () => {
  const report = buildOutreachReport({ sends, invites, events, leads, sessions });
  const a = report.prospects.find(p => p.leadId === LEAD_A)!;
  const b = report.prospects.find(p => p.leadId === LEAD_B)!;
  const c = report.prospects.find(p => p.leadId === LEAD_C)!;

  test('merges step reached, opens and demo depth per lead', () => {
    expect(a).toMatchObject({
      businessName: 'Durgin Electric',
      campaign: 'assoc-outreach-1',
      stepReached: 2,
      opens: 3,
      firstOpenedAt: '2026-11-10T15:00:00Z',
      lastOpenedAt: '2026-11-11T09:00:00Z',
      demoStarted: true,
      demoFinished: true,
      demoMinutes: 6,
      recordedDemoMinutes: 7,
      deepestMilestone: 'voice_ended',
    });
  });

  test('a lead with no opens and no visit stays zeroed, not dropped', () => {
    expect(b).toMatchObject({ stepReached: 1, opens: 0, firstOpenedAt: null, demoStarted: false, demoMinutes: 0, deepestMilestone: null });
  });

  test('scan-only lead counts as started with no minutes', () => {
    expect(c).toMatchObject({ campaign: 'assoc-outreach-2', demoStarted: true, demoFinished: false, demoMinutes: 0, deepestMilestone: 'scan_started' });
  });

  test('prospects sort by engagement: opens first', () => {
    expect(report.prospects[0].leadId).toBe(LEAD_A);
  });

  test('empty inputs produce an empty report', () => {
    expect(buildOutreachReport({ sends: [], invites: [], events: [], leads: [], sessions: [] })).toEqual({ campaigns: [], prospects: [] });
  });

  test('multiple invites for one lead merge opens and open window', () => {
    const merged = buildOutreachReport({
      sends: [],
      invites: [
        { lead_id: LEAD_A, campaign: 'assoc-outreach-1', first_opened_at: '2026-11-10T15:00:00Z', last_opened_at: '2026-11-10T15:30:00Z', open_count: 2 },
        { lead_id: LEAD_A, campaign: 'assoc-outreach-1', first_opened_at: '2026-11-09T10:00:00Z', last_opened_at: '2026-11-12T10:00:00Z', open_count: 5 },
      ],
      events: [],
      leads,
      sessions: [],
    });
    const row = merged.prospects.find(p => p.leadId === LEAD_A)!;
    expect(row.opens).toBe(7);
    expect(row.firstOpenedAt).toBe('2026-11-09T10:00:00Z');
    expect(row.lastOpenedAt).toBe('2026-11-12T10:00:00Z');
  });
});
