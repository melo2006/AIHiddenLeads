// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { slotIsFree, timedBusyIntervals, voiceAvailability, platformAvailability } from '../../supabase/functions/_shared/platform-calendar';
import { etWallToUtc, generateSlots } from '@/lib/bookingSlots';
import { vi } from 'vitest';

const iso = (day: string, hour: number, minute = 0) => etWallToUtc(day, hour, minute).toISOString();

describe('platform calendar booking policy', () => {
  it('does not block appointments for an all-day trip spanning October 22–November 12', () => {
    const busy = timedBusyIntervals([{ start: { date: '2026-10-22' }, end: { date: '2026-11-13' } }]);
    expect(busy).toEqual([]);
    expect(slotIsFree(iso('2026-10-26', 8), busy)).toBe(true);
  });
  it('blocks only an actual 8–9 AM timed event, allowing appointments at its boundaries', () => {
    const busy = timedBusyIntervals([{ start: { dateTime: iso('2026-10-26', 8) }, end: { dateTime: iso('2026-10-26', 9) } }]);
    expect(slotIsFree(iso('2026-10-26', 8, 30), busy)).toBe(false);
    expect(slotIsFree(iso('2026-10-26', 9), busy)).toBe(true);
    expect(slotIsFree(iso('2026-10-26', 7, 45), busy)).toBe(true);
  });
  it('ignores cancelled and explicitly free timed events', () => {
    const event = { start: { dateTime: iso('2026-10-26', 12) }, end: { dateTime: iso('2026-10-26', 14) } };
    expect(timedBusyIntervals([{ ...event, status: 'cancelled' }, { ...event, transparency: 'transparent' }])).toEqual([]);
  });
  it('uses actual offsets even when travelling outside Eastern time', () => {
    const busy = timedBusyIntervals([{ start: { dateTime: '2026-10-27T11:00:00+11:00' }, end: { dateTime: '2026-10-27T12:00:00+11:00' } }]);
    expect(slotIsFree('2026-10-27T00:30:00Z', busy)).toBe(false);
    expect(slotIsFree(iso('2026-10-27', 8), busy)).toBe(true);
  });
  it('offers the next available business day when the first three dates are full', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const slots = generateSlots(now).filter(s => s.dateStr >= '2026-10-29');
    const result = voiceAvailability(slots, now);
    expect(result.nextThreeDaysFull).toBe(true);
    expect(result.nextAvailable?.dateStr).toBe('2026-10-29');
    expect([...new Set(result.slots.map(s => s.dateStr))]).toEqual(['2026-10-29', '2026-10-30']);
    expect(result.slots).toHaveLength(80);
  });
  it('does not claim the next three days are full when an opening exists', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    expect(voiceAvailability(generateSlots(now), now).nextThreeDaysFull).toBe(false);
  });
  it('checks later event pages and stored reservations before offering a slot', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T10:00:00Z'));
    vi.stubGlobal('Deno', { env: { get: () => 'test-only' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ start: { date: '2026-10-22' }, end: { date: '2026-11-13' } }], nextPageToken: 'second-page' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ start: { dateTime: iso('2026-10-26', 8) }, end: { dateTime: iso('2026-10-26', 9) } }] })));
    vi.stubGlobal('fetch', fetchMock);
    const db = { from: () => ({ select: () => ({ neq: () => ({ gte: async () => ({ data: [{ slot_start: iso('2026-10-26', 9) }], error: null }) }) }) }) };
    try {
      const slots = await platformAvailability(db);
      expect(slots[0].iso).toBe(iso('2026-10-26', 9, 15));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toContain('pageToken=second-page');
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});