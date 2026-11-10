// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  BOOKING_ICS_FILENAME,
  BOOKING_ICS_ORGANIZER_EMAIL,
  resolveBookingInviteIcs,
} from '../../supabase/functions/_shared/booking-ics';
import { buildBookingInviteIcs } from '../../supabase/functions/_shared/platform-calendar';

const BOOKING_ID = '9ae89d83-1617-4cc5-9339-80f3705574d0';
const NOW = new Date('2026-11-11T20:00:00.000Z');

const row = (patch: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  name: 'Sam Prospect',
  email: 'sam@example.com',
  phone: '+19547706622',
  business_name: 'Sam LLC',
  notes: 'Wants the demo recap.',
  slot_start: '2026-11-18T19:30:00.000Z',
  status: 'confirmed',
  ...patch,
});

/** Minimal PostgREST-shaped stub: from().select().eq().maybeSingle(). */
function dbReturning(data: unknown, error: unknown = null) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      calls.push(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data, error }),
          }),
        }),
      };
    },
  };
  return { db, calls };
}

describe('resolveBookingInviteIcs (get-booking-ics handler logic)', () => {
  test('unknown booking id → 404', async () => {
    const { db } = dbReturning(null);
    const result = await resolveBookingInviteIcs(db, BOOKING_ID, BOOKING_ICS_ORGANIZER_EMAIL, NOW);
    expect(result).toEqual({ ok: false, status: 404, error: 'Booking not found' });
  });

  test('a database error → 404 (no distinction leaked)', async () => {
    const { db } = dbReturning(null, { message: 'boom' });
    const result = await resolveBookingInviteIcs(db, BOOKING_ID, BOOKING_ICS_ORGANIZER_EMAIL, NOW);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  test('cancelled booking → 404', async () => {
    const { db } = dbReturning(row({ status: 'cancelled' }));
    const result = await resolveBookingInviteIcs(db, BOOKING_ID, BOOKING_ICS_ORGANIZER_EMAIL, NOW);
    expect(result).toEqual({ ok: false, status: 404, error: 'Booking not found' });
  });

  test('malformed booking id → 404 without touching the database', async () => {
    const { db, calls } = dbReturning(row());
    for (const bad of ['', 'not-a-uuid', '../../etc/passwd', '9ae89d83-1617-4cc5-9339']) {
      const result = await resolveBookingInviteIcs(db, bad, BOOKING_ICS_ORGANIZER_EMAIL, NOW);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    }
    expect(calls).toHaveLength(0);
  });

  test('valid booking → 200 text/calendar attachment, byte-identical to the email invite (same UID)', async () => {
    const { db, calls } = dbReturning(row());
    const result = await resolveBookingInviteIcs(db, BOOKING_ID, BOOKING_ICS_ORGANIZER_EMAIL, NOW);
    expect(calls).toEqual(['implementation_calls']);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok result');
    expect(result.status).toBe(200);
    expect(result.contentType).toBe('text/calendar; charset=utf-8');
    expect(result.contentDisposition).toBe(`attachment; filename="${BOOKING_ICS_FILENAME}"`);
    expect(result.filename).toBe('ai-hidden-leads-call.ics');

    const expected = buildBookingInviteIcs({
      name: 'Sam Prospect',
      email: 'sam@example.com',
      phone: '+19547706622',
      businessName: 'Sam LLC',
      notes: 'Wants the demo recap.',
      slotStart: '2026-11-18T19:30:00.000Z',
      bookingId: BOOKING_ID,
      organizerEmail: BOOKING_ICS_ORGANIZER_EMAIL,
      now: NOW,
    });
    expect(result.ics).toBe(expected);
    // The UID is the deterministic booking-derived one the email invite uses.
    expect(result.ics).toContain(`UID:${BOOKING_ID.replace(/-/g, '')}@aihiddenleads.com`);
    expect(result.ics).toContain('BEGIN:VCALENDAR');
    expect(result.ics).toContain('METHOD:REQUEST');
  });
});

describe('/cal/<bookingId> route surface', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../pages/BookingCalendar.tsx', import.meta.url), 'utf8');
  const fn = readFileSync(new URL('../../supabase/functions/get-booking-ics/index.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');

  test('the SPA routes /cal/:bookingId to the BookingCalendar page', () => {
    expect(app).toContain('path="/cal/:bookingId"');
    expect(app).toContain('BookingCalendar');
  });

  test('the page fetches the invite from get-booking-ics and downloads it, with a tap fallback', () => {
    expect(page).toContain('get-booking-ics');
    expect(page).toContain('Adding your call to your calendar');
    expect(page).toContain('Download calendar invite');
    expect(page).toContain('ai-hidden-leads-call.ics');
    expect(page).toContain('download');
  });

  test('the edge function serves the shared resolver as an attachment and is public-by-booking-id', () => {
    expect(fn).toContain('resolveBookingInviteIcs');
    expect(fn).toContain('Content-Disposition');
    expect(config).toContain('[functions.get-booking-ics]');
  });
});
