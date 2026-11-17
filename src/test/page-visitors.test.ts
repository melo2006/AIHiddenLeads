// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  MEASURED_CHAT_USD_PER_MINUTE, MEASURED_VOICE_USD_PER_MINUTE, SIMLI_USD_PER_MINUTE,
  estimateSessionCost, filterVisitorRows, formatUsd, formatVisitorDuration,
  groupVisitorsByDay, mergeVisitorRecords, todaySubtotal, voiceSessionIdFromRef,
  type SessionCost, type VisitorRecordListItem, type VoicePricing,
} from '@/lib/pageVisitors';

const pricing: VoicePricing = {
  model: 'gemini-3.8-live',
  inputAudioPerMinute: 0.03,
  outputAudioPerMinute: 0.12,
  source: 'https://ai.google.dev/gemini-api/docs/pricing',
};

const item = (over: Partial<VisitorRecordListItem>): VisitorRecordListItem => ({
  id: 'r1', channel: 'voice', business_name: 'AI Hidden Leads', status: 'ended',
  summary_status: 'ready', created_at: '2026-11-17T15:00:00.000Z', ended_at: '2026-11-17T15:10:00.000Z',
  ...over,
});

describe('row shaping', () => {
  test('merges both channels newest first and tolerates an empty payload', () => {
    const rows = mergeVisitorRecords([
      item({ id: 'old-chat', channel: 'chat', created_at: '2026-11-16T10:00:00.000Z', ended_at: '2026-11-16T10:05:00.000Z' }),
      item({ id: 'new-voice', created_at: '2026-11-17T15:00:00.000Z' }),
      item({ id: 'mid-chat', channel: 'chat', created_at: '2026-11-17T09:00:00.000Z', ended_at: '2026-11-17T09:02:00.000Z' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['new-voice', 'mid-chat', 'old-chat']);
    expect(rows.map((r) => r.channelLabel)).toEqual(['Voice', 'Chat', 'Chat']);
    expect(mergeVisitorRecords(null)).toEqual([]);
    expect(mergeVisitorRecords(undefined)).toEqual([]);
  });

  test('derives duration from the record span and nulls it without an end stamp', () => {
    const [withEnd] = mergeVisitorRecords([item({})]);
    expect(withEnd.durationSeconds).toBe(600);
    const [open] = mergeVisitorRecords([item({ ended_at: null })]);
    expect(open.durationSeconds).toBeNull();
  });

  test('parses the voice session id out of session_ref only for gemini refs', () => {
    expect(voiceSessionIdFromRef('gemini_abc-123')).toBe('abc-123');
    expect(voiceSessionIdFromRef('chat_deadbeef')).toBeNull();
    expect(voiceSessionIdFromRef(null)).toBeNull();
    expect(voiceSessionIdFromRef(undefined)).toBeNull();
    const [row] = mergeVisitorRecords([item({ session_ref: 'gemini_sess-9' })]);
    expect(row.voiceSessionId).toBe('sess-9');
  });

  test('filters by channel', () => {
    const rows = mergeVisitorRecords([item({ id: 'v' }), item({ id: 'c', channel: 'chat' })]);
    expect(filterVisitorRows(rows, 'all')).toHaveLength(2);
    expect(filterVisitorRows(rows, 'voice').map((r) => r.id)).toEqual(['v']);
    expect(filterVisitorRows(rows, 'chat').map((r) => r.id)).toEqual(['c']);
  });

  test('formats durations and money the way the sibling views do', () => {
    expect(formatVisitorDuration(65)).toBe('1:05');
    expect(formatVisitorDuration(null)).toBe('—');
    expect(formatUsd(0.024)).toBe('$0.0240');
    expect(formatUsd(null)).toBe('—');
  });
});

describe('session cost estimates', () => {
  test('chat: Gemini line only, priced from duration at the measured chat rate', () => {
    const cost = estimateSessionCost({ channel: 'chat', durationSeconds: 600 });
    expect(cost.geminiUsd).toBeCloseTo(10 * MEASURED_CHAT_USD_PER_MINUTE, 10);
    expect(cost.simliUsd).toBeNull();
    expect(cost.telephonyUsd).toBeNull();
    expect(cost.totalUsd).toBe(cost.geminiUsd);
    expect(cost.basis).toBe('duration');
  });

  test('chat with no measurable span prices nothing', () => {
    const cost = estimateSessionCost({ channel: 'chat', durationSeconds: null });
    expect(cost.totalUsd).toBeNull();
    expect(cost.basis).toBe('none');
  });

  test('voice: the saved session estimate wins (measured basis)', () => {
    const cost = estimateSessionCost({
      channel: 'voice', durationSeconds: 600, pricing,
      voiceSession: { id: 's1', duration_seconds: 600, usage: { model: 'gemini-3.8-live', audio_estimate_usd: 0.5 } },
    });
    expect(cost.geminiUsd).toBe(0.5);
    expect(cost.basis).toBe('measured');
    expect(cost.simliUsd).toBeNull();
    expect(cost.totalUsd).toBe(0.5);
  });

  test('voice: recorded audio seconds are priced with the shared estimator', () => {
    const cost = estimateSessionCost({
      channel: 'voice', durationSeconds: 600, pricing,
      voiceSession: { id: 's1', duration_seconds: 600, usage: { model: 'gemini-3.8-live', input_audio_seconds: 300, output_audio_seconds: 150, audio_estimate_usd: null } },
    });
    // (300 × $0.03 + 150 × $0.12) / 60 = $0.45
    expect(cost.geminiUsd).toBeCloseTo(0.45, 10);
    expect(cost.basis).toBe('measured');
  });

  test('voice: model-mismatched pricing falls back to the measured voice rate', () => {
    const cost = estimateSessionCost({
      channel: 'voice', durationSeconds: 600, pricing,
      voiceSession: { id: 's1', duration_seconds: 600, usage: { model: 'some-other-model', input_audio_seconds: 300, output_audio_seconds: 150 } },
    });
    expect(cost.geminiUsd).toBeCloseTo(10 * MEASURED_VOICE_USD_PER_MINUTE, 10);
    expect(cost.basis).toBe('duration');
  });

  test('voice: Simli line appears only when the avatar was active, and the total sums the lines', () => {
    const withAvatar = estimateSessionCost({
      channel: 'voice', durationSeconds: 600, pricing, videoAvatarMinutes: 10,
      voiceSession: { id: 's1', duration_seconds: 600, usage: { audio_estimate_usd: 0.5 } },
    });
    expect(withAvatar.simliUsd).toBeCloseTo(10 * SIMLI_USD_PER_MINUTE, 10);
    expect(withAvatar.totalUsd).toBeCloseTo(0.5 + 10 * SIMLI_USD_PER_MINUTE, 10);

    const withoutAvatar = estimateSessionCost({
      channel: 'voice', durationSeconds: 600, pricing, videoAvatarMinutes: null,
      voiceSession: { id: 's1', duration_seconds: 600, usage: { audio_estimate_usd: 0.5 } },
    });
    expect(withoutAvatar.simliUsd).toBeNull();
    expect(withoutAvatar.totalUsd).toBe(0.5);
  });

  test('voice with zero measurable usage prices nothing; unknown channels price nothing', () => {
    expect(estimateSessionCost({ channel: 'voice', durationSeconds: 0 }).totalUsd).toBeNull();
    expect(estimateSessionCost({ channel: 'voice', durationSeconds: null }).basis).toBe('none');
    expect(estimateSessionCost({ channel: 'smoke-signal', durationSeconds: 600 }).totalUsd).toBeNull();
  });
});

describe('day subtotals', () => {
  const now = new Date('2026-11-17T18:00:00.000Z');
  const rows = mergeVisitorRecords([
    item({ id: 'today-voice', created_at: '2026-11-17T15:00:00.000Z' }),
    item({ id: 'today-chat', channel: 'chat', created_at: '2026-11-17T16:00:00.000Z', ended_at: '2026-11-17T16:10:00.000Z' }),
    item({ id: 'yday-voice', created_at: '2026-11-16T15:00:00.000Z' }),
    item({ id: 'yday-unpriced', created_at: '2026-11-16T09:00:00.000Z', ended_at: null }),
  ]);
  const costs = new Map<string, SessionCost>([
    ['today-voice', estimateSessionCost({ channel: 'voice', durationSeconds: 600 })],
    ['today-chat', estimateSessionCost({ channel: 'chat', durationSeconds: 600 })],
    ['yday-voice', estimateSessionCost({ channel: 'voice', durationSeconds: 1200 })],
    ['yday-unpriced', estimateSessionCost({ channel: 'voice', durationSeconds: null })],
  ]);

  test('groups by day with a subtotal that sums the session totals', () => {
    const groups = groupVisitorsByDay(rows, costs, now);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].conversationCount).toBe(2);
    expect(groups[0].totalUsd).toBeCloseTo(10 * MEASURED_VOICE_USD_PER_MINUTE + 10 * MEASURED_CHAT_USD_PER_MINUTE, 10);
    expect(groups[1].label).toBe('Yesterday');
    expect(groups[1].conversationCount).toBe(2);
    expect(groups[1].pricedCount).toBe(1);
    expect(groups[1].totalUsd).toBeCloseTo(20 * MEASURED_VOICE_USD_PER_MINUTE, 10);
  });

  test('today subtotal counts only today’s conversations', () => {
    const today = todaySubtotal(rows, costs, now);
    expect(today.count).toBe(2);
    expect(today.pricedCount).toBe(2);
    expect(today.totalUsd).toBeCloseTo(10 * MEASURED_VOICE_USD_PER_MINUTE + 10 * MEASURED_CHAT_USD_PER_MINUTE, 10);
  });
});
