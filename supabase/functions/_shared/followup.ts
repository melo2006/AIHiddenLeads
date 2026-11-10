// Follow-up pack — pure decision logic + message builders.
//
// Everything in this module is deterministic and side-effect free so the
// send/don't-send decisions (consent gating, exactly-once, reminder windows,
// no-show detection) can be unit tested under vitest/node, same pattern as
// phone-demo.ts and verification-code.ts. The impure senders live in
// _shared/twilio-sms.ts (Twilio) and the calling edge functions.

export const AIHL_PHONE_NUMBER = '+15612755757';
/** The A2P campaign's messaging service ("AI Hidden Leads A2P"). */
export const AIHL_MESSAGING_SERVICE_SID = 'MG4f103e9599c9f0bae895d3e2d03ae53d';
export const BOOK_CALL_URL = 'https://aihiddenleads.com/book';
export const SMS_OPT_OUT_LINE = 'Reply STOP to opt out';

/**
 * Normalize a dialable number to E.164 the same way send-outreach-sms does:
 * 10 digits → +1…, 11 digits starting with 1 → +…, already-+ kept, anything
 * else gets a + prefix on its digits. Returns null when there are too few
 * digits to be a real number.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (value.startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

// ---------------------------------------------------------------------------
// Phone-demo recap SMS
// ---------------------------------------------------------------------------

export interface RecapSmsFacts {
  /** The lead has a usable mobile number (raw value; normalized here). */
  mobile: string | null | undefined;
  /** The caller explicitly said yes to the follow-up text on the call. */
  smsConsent: boolean;
  /** The number is on the sms_opt_outs list (replied STOP before). */
  optedOut: boolean;
  /** Prior recap-SMS markers read from the sms_delivery_log (exactly-once). */
  prior: { sent: boolean; attempts: number };
}

export type RecapSmsDecision =
  | { send: true; to: string }
  | { send: false; reason: 'no_mobile' | 'no_consent' | 'opted_out' | 'already_sent' | 'retry_exhausted' };

/** A failed recap text may be retried once by a later recap call; never more. */
export const RECAP_SMS_MAX_ATTEMPTS = 2;

export function recapSmsDecision(facts: RecapSmsFacts): RecapSmsDecision {
  const to = normalizePhoneE164(facts.mobile);
  if (!to) return { send: false, reason: 'no_mobile' };
  if (!facts.smsConsent) return { send: false, reason: 'no_consent' };
  if (facts.optedOut) return { send: false, reason: 'opted_out' };
  if (facts.prior.sent) return { send: false, reason: 'already_sent' };
  if (facts.prior.attempts >= RECAP_SMS_MAX_ATTEMPTS) return { send: false, reason: 'retry_exhausted' };
  return { send: true, to };
}

/**
 * Recap SMS body: summary on top, then the demo link, then — when the
 * caller booked nothing on the call (bookingPending) — the booking link
 * as the zero-pressure fallback from Ron's slot-offer method ("grab any
 * time that suits you, no rush"), then the opt-out line.
 */
export function buildRecapSmsBody(input: { businessName: string; summary: string; demoLink: string; bookingPending?: boolean }): string {
  const clean = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const businessName = clean(input.businessName, 80) || 'your business';
  const summary = clean(input.summary, 220)
    || `You just heard Aspen answer calls as the receptionist for ${businessName}, in a demo built live from the details you gave on the call.`;
  return [
    `Your AI Hidden Leads phone demo for ${businessName}: ${summary}`,
    `See Aspen on your website: ${input.demoLink}`,
    ...(input.bookingPending ? [`Book your 15–20 min intro call any time: ${BOOK_CALL_URL}`] : []),
    SMS_OPT_OUT_LINE,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Booking (implementation call) messages
// ---------------------------------------------------------------------------

const ET_TZ = 'America/New_York';

/** "Tuesday, Nov 18 at 2:30 PM ET" — the compact slot label used in SMS. */
export function formatSlotForSms(slotStartIso: string): string {
  const d = new Date(slotStartIso);
  if (Number.isNaN(d.getTime())) return String(slotStartIso || '');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ, weekday: 'long', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('weekday')}, ${get('month')} ${get('day')} at ${get('hour')}:${get('minute')} ${get('dayPeriod')} ET`;
}

const gcalStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Google Calendar "add to calendar" template link for a booked slot. */
export function buildAddToCalendarUrl(input: { slotStartIso: string; durationMinutes: number; name: string }): string {
  const start = new Date(input.slotStartIso);
  const end = new Date(start.getTime() + input.durationMinutes * 60000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `AI Hidden Leads implementation call — ${String(input.name || '').trim() || 'your call'}`,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    details: 'Your 30-minute implementation call with the AI Hidden Leads team. We will call you at the number you gave us.',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildBookingConfirmationSms(input: { slotStartIso: string; durationMinutes: number; name: string }): string {
  return [
    `You're booked: 30-minute implementation call with the AiHiddenLeads team, ${formatSlotForSms(input.slotStartIso)}.`,
    `Add to calendar: ${buildAddToCalendarUrl(input)}`,
    SMS_OPT_OUT_LINE,
  ].join('\n');
}

export function buildBookingReminderSms(input: { slotStartIso: string }): string {
  return [
    `Reminder: your implementation call with the AiHiddenLeads team is coming up — ${formatSlotForSms(input.slotStartIso)}. We'll call you then.`,
    SMS_OPT_OUT_LINE,
  ].join('\n');
}

export function buildNoShowRecoverySms(input: { slotStartIso: string }): string {
  return [
    `Sorry we missed you — your implementation call was ${formatSlotForSms(input.slotStartIso)}. Pick a new time here: ${BOOK_CALL_URL}`,
    SMS_OPT_OUT_LINE,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Reminder / no-show sweep decisions
// ---------------------------------------------------------------------------

export interface FollowupBooking {
  id: string;
  status: string;
  slot_start: string;
  name?: string | null;
  email?: string | null;
  business_name?: string | null;
  phone?: string | null;
  sms_consent?: boolean | null;
  optedOut?: boolean;
  reminder_24h_sent_at?: string | null;
  reminder_1h_sent_at?: string | null;
  noshow_sent_at?: string | null;
}

export type FollowupAction = 'reminder_24h_email' | 'reminder_1h_sms' | 'noshow_recovery';

/** The 24h email reminder is due from 24h before the slot until the slot. */
export const REMINDER_24H_WINDOW_MS = 24 * 3600_000;
/** The 1h SMS reminder is due from 1h before the slot until the slot. */
export const REMINDER_1H_WINDOW_MS = 3600_000;
/** A booking counts as a no-show once its slot END has passed with no outcome. */
export const NOSHOW_GRACE_MS = 0;

/**
 * What the sweep owes one booking right now. Pure: the caller supplies the
 * current time. Only 'confirmed' bookings are followed up (pending rows never
 * got a calendar event; cancelled rows are dead). The no-show branch wins
 * over reminders once the slot has fully passed — a late sweep sends the
 * recovery, not a stale reminder. SMS actions additionally require a usable
 * phone, recorded consent and no opt-out; the email reminder needs none of
 * those (transactional mail to the booking address).
 */
export function dueFollowupActions(booking: FollowupBooking, now: Date, slotMinutes: number): FollowupAction[] {
  if (booking.status !== 'confirmed') return [];
  const start = Date.parse(booking.slot_start);
  if (!Number.isFinite(start)) return [];
  const nowMs = now.getTime();
  const end = start + slotMinutes * 60000;

  if (nowMs >= end + NOSHOW_GRACE_MS) {
    return booking.noshow_sent_at ? [] : ['noshow_recovery'];
  }
  if (nowMs >= start) return []; // in progress — nothing due

  const smsReady = Boolean(normalizePhoneE164(booking.phone)) && booking.sms_consent === true && !booking.optedOut;
  const actions: FollowupAction[] = [];
  if (!booking.reminder_24h_sent_at && start - nowMs <= REMINDER_24H_WINDOW_MS) actions.push('reminder_24h_email');
  if (!booking.reminder_1h_sent_at && start - nowMs <= REMINDER_1H_WINDOW_MS && smsReady) actions.push('reminder_1h_sms');
  return actions;
}
