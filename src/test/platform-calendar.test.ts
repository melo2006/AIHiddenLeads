// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { slotIsFree, slotConflictsWithReservation, timedBusyIntervals, voiceAvailability, platformAvailability } from '../../supabase/functions/_shared/platform-calendar';
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
    // A 30-minute slot ending exactly when the event starts is free.
    expect(slotIsFree(iso('2026-10-26', 7, 30), busy)).toBe(true);
    // A 30-minute slot starting at 7:45 would run into the event (off-grid probe).
    expect(slotIsFree(iso('2026-10-26', 7, 45), busy)).toBe(false);
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
    expect(result.slots).toHaveLength(40);
  });
  it('does not claim the next three days are full when an opening exists', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    expect(voiceAvailability(generateSlots(now), now).nextThreeDaysFull).toBe(false);
  });
  it('offers 2 PM and 2:30 PM Eastern when a requested noon conflicts with a noon–2 PM event', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const busy = [{ start: iso('2026-10-26', 12), end: iso('2026-10-26', 14) }];
    const slots = generateSlots(now).filter(s => slotIsFree(s.iso, busy));
    const result = voiceAvailability(slots, now, iso('2026-10-26', 12));
    expect(result.requestedAvailable).toBe(false);
    expect(result.alternatives?.map(s => s.iso)).toEqual([iso('2026-10-26', 14), iso('2026-10-26', 14, 30)]);
    expect(result.durationMinutes).toBe(30);
    expect(result.timeZone).toBe('America/New_York');
  });
  it('recognizes the same available instant requested in Australian time without shifting business hours', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const result = voiceAvailability(generateSlots(now), now, '2026-10-27T05:00:00+11:00');
    expect(result.requestedAvailable).toBe(true);
    expect(result.requestedSlot).toBe(iso('2026-10-26', 14));
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
      expect(slots[0].iso).toBe(iso('2026-10-26', 9));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toContain('pageToken=second-page');
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
  it('stored reservations block by interval, not exact start, so off-grid bookings still protect their slot', () => {
    const reservations = [{ slot_start: iso('2026-10-26', 9) }];
    expect(slotConflictsWithReservation(iso('2026-10-26', 9), reservations)).toBe(true);
    expect(slotConflictsWithReservation(iso('2026-10-26', 9, 30), reservations)).toBe(false);
    expect(slotConflictsWithReservation(iso('2026-10-26', 8, 30), reservations)).toBe(false);
    // A legacy 15-minute-era reservation at 9:15 sits inside the 9:00 and overlaps the 9:30 slot's start edge — both grid slots must yield.
    const legacy = [{ slot_start: iso('2026-10-26', 9, 15) }];
    expect(slotConflictsWithReservation(iso('2026-10-26', 9), legacy)).toBe(true);
    expect(slotConflictsWithReservation(iso('2026-10-26', 9, 30), legacy)).toBe(true);
    expect(slotConflictsWithReservation(iso('2026-10-26', 8, 30), legacy)).toBe(false);
    expect(slotConflictsWithReservation('not-a-date', legacy)).toBe(false);
  });
  it('platformAvailability hides a slot overlapped by an off-grid stored reservation', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T10:00:00Z'));
    // Mint a real throwaway RSA key so googleAccessToken can run end to end
    // (the 'test-only' env stub dies in pemToArrayBuffer — that is the known
    // baseline failure on the older test above, not this one).
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign'],
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    let b64 = '';
    pkcs8.forEach(b => { b64 += String.fromCharCode(b); });
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(b64).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----`;
    vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'GOOGLE_SA_PRIVATE_KEY' ? pem : name === 'GOOGLE_SA_CLIENT_EMAIL' ? 'test@example.iam.gserviceaccount.com' : 'test-only' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 })))
      .mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const db = { from: () => ({ select: () => ({ neq: () => ({ gte: async () => ({ data: [{ slot_start: iso('2026-10-26', 9, 15) }], error: null }) }) }) }) };
    try {
      const slots = await platformAvailability(db);
      const day = slots.filter(s => s.dateStr === '2026-10-26').map(s => s.iso);
      expect(day).not.toContain(iso('2026-10-26', 9));
      expect(day).not.toContain(iso('2026-10-26', 9, 30));
      expect(day).toContain(iso('2026-10-26', 10));
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});