// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  BOOK_CALL_URL,
  buildAddToCalendarUrl,
  buildBookingCalendarUrl,
  buildBookingConfirmationSms,
  buildBookingReminderSms,
  buildNoShowRecoverySms,
  buildRecapSmsBody,
  dueFollowupActions,
  formatSlotForSms,
  normalizePhoneE164,
  recapSmsDecision,
  type FollowupBooking,
} from '../../supabase/functions/_shared/followup';
import { PHONE_DEMO_LINK } from '../../supabase/functions/_shared/phone-demo';

describe('normalizePhoneE164', () => {
  test('normalizes US numbers like send-outreach-sms does', () => {
    expect(normalizePhoneE164('9547706622')).toBe('+19547706622');
    expect(normalizePhoneE164('1 (954) 770-6622')).toBe('+19547706622');
    expect(normalizePhoneE164('+1 954 770 6622')).toBe('+19547706622');
    expect(normalizePhoneE164('+44 20 7946 0958')).toBe('+442079460958');
  });
  test('rejects empties and too-short numbers', () => {
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164(undefined)).toBeNull();
    expect(normalizePhoneE164('555-1234')).toBeNull();
  });
});

describe('recapSmsDecision (consent gating + exactly-once)', () => {
  const base = { mobile: '9547706622', smsConsent: true, optedOut: false, prior: { sent: false, attempts: 0 } };
  test('sends when consented, reachable, fresh', () => {
    expect(recapSmsDecision(base)).toEqual({ send: true, to: '+19547706622' });
  });
  test('no consent → no send', () => {
    expect(recapSmsDecision({ ...base, smsConsent: false })).toEqual({ send: false, reason: 'no_consent' });
  });
  test('no usable mobile → no send (checked before consent)', () => {
    expect(recapSmsDecision({ ...base, mobile: null })).toEqual({ send: false, reason: 'no_mobile' });
    expect(recapSmsDecision({ ...base, mobile: '123' })).toEqual({ send: false, reason: 'no_mobile' });
  });
  test('opted out → no send even with consent', () => {
    expect(recapSmsDecision({ ...base, optedOut: true })).toEqual({ send: false, reason: 'opted_out' });
  });
  test('a prior successful send blocks any re-send (exactly once)', () => {
    expect(recapSmsDecision({ ...base, prior: { sent: true, attempts: 1 } })).toEqual({ send: false, reason: 'already_sent' });
  });
  test('one failed attempt may retry; two failures exhaust', () => {
    expect(recapSmsDecision({ ...base, prior: { sent: false, attempts: 1 } }).send).toBe(true);
    expect(recapSmsDecision({ ...base, prior: { sent: false, attempts: 2 } })).toEqual({ send: false, reason: 'retry_exhausted' });
  });
});

describe('buildRecapSmsBody', () => {
  test('summary line, demo link, STOP line — and the link is the shared demo link', () => {
    const body = buildRecapSmsBody({ businessName: 'Lassiter Electric', summary: 'Aspen took a panel-upgrade request and booked a visit.', demoLink: PHONE_DEMO_LINK });
    const lines = body.split('\n');
    expect(lines[0]).toContain('Lassiter Electric');
    expect(lines[0]).toContain('panel-upgrade');
    expect(lines[1]).toBe(`See Aspen on your website: ${PHONE_DEMO_LINK}`);
    expect(lines[2]).toBe('Reply STOP to opt out');
  });
  test('falls back to the standard summary when none is given', () => {
    const body = buildRecapSmsBody({ businessName: '', summary: '', demoLink: PHONE_DEMO_LINK });
    expect(body).toContain('your business');
    expect(body).toContain('answer calls as the receptionist');
  });
  test('bookingPending adds the /book fallback link before the STOP line (phase 2 zero-pressure exit)', () => {
    const body = buildRecapSmsBody({ businessName: 'Lassiter Electric', summary: 'Aspen took a panel-upgrade request.', demoLink: PHONE_DEMO_LINK, bookingPending: true });
    const lines = body.split('\n');
    expect(lines[2]).toBe(`Book your 15–20 min intro call any time: ${BOOK_CALL_URL}`);
    expect(lines[3]).toBe('Reply STOP to opt out');
    expect(BOOK_CALL_URL).toBe('https://aihiddenleads.com/book');
  });
  test('a caller who already booked gets NO booking link in the recap', () => {
    const body = buildRecapSmsBody({ businessName: 'Lassiter Electric', summary: 'Aspen took a panel-upgrade request.', demoLink: PHONE_DEMO_LINK, bookingPending: false });
    expect(body).not.toContain(BOOK_CALL_URL);
  });
});

describe('formatSlotForSms', () => {
  test('renders the ET wall-clock label (EST)', () => {
    expect(formatSlotForSms('2026-11-18T19:30:00.000Z')).toBe('Wednesday, Nov 18 at 2:30 PM ET');
  });
  test('renders the ET wall-clock label (EDT)', () => {
    expect(formatSlotForSms('2026-07-08T18:00:00.000Z')).toBe('Wednesday, Jul 8 at 2:00 PM ET');
  });
});

describe('buildAddToCalendarUrl', () => {
  test('carries a 30-minute window in UTC stamps', () => {
    const url = buildAddToCalendarUrl({ slotStartIso: '2026-11-18T19:30:00.000Z', durationMinutes: 30, name: 'Sam' });
    expect(url).toContain('calendar.google.com/calendar/render');
    expect(url).toContain('dates=20261118T193000Z%2F20261118T200000Z');
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toContain('AI Hidden Leads implementation call — Sam');
  });
});

describe('buildBookingCalendarUrl', () => {
  test('is the short branded /cal/<bookingId> link', () => {
    expect(buildBookingCalendarUrl('9ae89d83-1617-4cc5-9339-80f3705574d0'))
      .toBe('https://aihiddenleads.com/cal/9ae89d83-1617-4cc5-9339-80f3705574d0');
  });
});

describe('booking SMS bodies', () => {
  const slot = '2026-11-18T19:30:00.000Z';
  test('confirmation states the 30-minute block, the formatted slot, the SHORT branded invite link and STOP (no raw Google URL, no email pointer)', () => {
    const bookingId = '9ae89d83-1617-4cc5-9339-80f3705574d0';
    const body = buildBookingConfirmationSms({ slotStartIso: slot, durationMinutes: 30, name: 'Sam', bookingId });
    expect(body).toBe(
      "You're booked: 30-minute implementation call with the AiHiddenLeads team, Wednesday, Nov 18 at 2:30 PM ET.\n" +
      `Add to calendar: https://aihiddenleads.com/cal/${bookingId}\n` +
      'Reply STOP to opt out',
    );
    expect(body.split('\n')).toHaveLength(3);
    expect(body).not.toContain('calendar.google.com');
    expect(body).not.toContain('confirmation email');
  });
  test('reminder names the slot and the STOP line', () => {
    const body = buildBookingReminderSms({ slotStartIso: slot });
    expect(body).toContain('Wednesday, Nov 18 at 2:30 PM ET');
    expect(body).toContain('Reply STOP to opt out');
  });
  test('no-show recovery points at the rebook page', () => {
    const body = buildNoShowRecoverySms({ slotStartIso: slot });
    expect(body).toContain(BOOK_CALL_URL);
    expect(BOOK_CALL_URL).toBe('https://aihiddenleads.com/book');
  });
});

describe('dueFollowupActions (reminder windows + no-show)', () => {
  const SLOT_MIN = 30;
  const slotStart = '2026-11-18T19:30:00.000Z'; // Wed 2:30 PM ET
  const booking = (patch: Partial<FollowupBooking> = {}): FollowupBooking => ({
    id: 'b1', status: 'confirmed', slot_start: slotStart,
    phone: '+19547706622', sms_consent: true,
    reminder_24h_sent_at: null, reminder_1h_sent_at: null, noshow_sent_at: null,
    ...patch,
  });
  const at = (iso: string) => new Date(iso);

  test('nothing due more than 24h out', () => {
    expect(dueFollowupActions(booking(), at('2026-11-17T19:29:00.000Z'), SLOT_MIN)).toEqual([]);
  });
  test('24h email reminder due inside the 24h window', () => {
    expect(dueFollowupActions(booking(), at('2026-11-17T20:00:00.000Z'), SLOT_MIN)).toEqual(['reminder_24h_email']);
  });
  test('inside 1h both reminders are due for a consented booking', () => {
    expect(dueFollowupActions(booking(), at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual(['reminder_24h_email', 'reminder_1h_sms']);
  });
  test('1h SMS requires consent — without it only the email is due', () => {
    expect(dueFollowupActions(booking({ sms_consent: false }), at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual(['reminder_24h_email']);
    expect(dueFollowupActions(booking({ sms_consent: null }), at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual(['reminder_24h_email']);
  });
  test('1h SMS requires a usable phone and no opt-out', () => {
    expect(dueFollowupActions(booking({ phone: null }), at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual(['reminder_24h_email']);
    expect(dueFollowupActions(booking({ phone: '123' }), at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual(['reminder_24h_email']);
    expect(dueFollowupActions(booking({ optedOut: true }), at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual(['reminder_24h_email']);
  });
  test('stamped reminders never re-fire', () => {
    const stamped = booking({ reminder_24h_sent_at: '2026-11-17T20:00:00.000Z', reminder_1h_sent_at: '2026-11-18T18:45:00.000Z' });
    expect(dueFollowupActions(stamped, at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual([]);
  });
  test('during the slot itself nothing is due', () => {
    expect(dueFollowupActions(booking(), at('2026-11-18T19:45:00.000Z'), SLOT_MIN)).toEqual([]);
  });
  test('after the slot END a no-show recovery is due — and wins over stale reminders', () => {
    expect(dueFollowupActions(booking(), at('2026-11-18T20:00:00.000Z'), SLOT_MIN)).toEqual(['noshow_recovery']);
    expect(dueFollowupActions(booking(), at('2026-11-19T15:00:00.000Z'), SLOT_MIN)).toEqual(['noshow_recovery']);
  });
  test('a stamped recovery never re-fires', () => {
    expect(dueFollowupActions(booking({ noshow_sent_at: '2026-11-18T20:05:00.000Z' }), at('2026-11-19T15:00:00.000Z'), SLOT_MIN)).toEqual([]);
  });
  test('non-confirmed bookings are never followed up', () => {
    expect(dueFollowupActions(booking({ status: 'pending' }), at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual([]);
    expect(dueFollowupActions(booking({ status: 'cancelled' }), at('2026-11-19T15:00:00.000Z'), SLOT_MIN)).toEqual([]);
    expect(dueFollowupActions(booking({ status: 'completed' }), at('2026-11-19T15:00:00.000Z'), SLOT_MIN)).toEqual([]);
  });
  test('an unparseable slot start yields nothing', () => {
    expect(dueFollowupActions(booking({ slot_start: 'not-a-date' }), at('2026-11-18T19:00:00.000Z'), SLOT_MIN)).toEqual([]);
  });
});
