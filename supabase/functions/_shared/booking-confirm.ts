// Post-booking confirmations — ONE implementation for every booking path.
//
// Extracted (follow-up pack phase 2) from book-implementation-call so the
// public booking endpoint, Aspen's in-conversation website bookings
// (gemini-live-proxy) and Aspen's phone-demo bookings (telephony-stream)
// all trigger the SAME machinery with identical behavior:
//   - owner alert email (Hostinger SMTP),
//   - prospect confirmation email carrying the self-sent .ics invite,
//   - confirmation SMS when — and only when — the prospect consented,
//     has a usable mobile and has not opted out, claimed exactly-once on
//     the implementation_calls row (a failed send releases the claim so
//     the follow-up sweep / a retry can try once more).
// The booking endpoint's response contract is preserved: callers receive
// the ConfirmationSms outcome and echo it as `confirmationSms` exactly as
// the endpoint always has.

import { bookPlatformCall, buildBookingInviteIcs } from './platform-calendar.ts';
import { SLOT_MINUTES } from './booking-slots.ts';
import { buildBookingConfirmationSms, normalizePhoneE164 } from './followup.ts';
import { isSmsOptedOut, trySendFollowupSms } from './twilio-sms.ts';

// The mail lane is imported LAZILY (dynamic import inside the function):
// hostinger-mail.ts pulls an https: ESM dependency (denomailer) that the
// vitest/node loader cannot resolve, and this module is unit-tested with
// the mail lane stubbed via BookingConfirmDeps. Deno resolves the dynamic
// import identically in production.
export interface BookingMailLane {
  sendAlert: (details: BookingContact & { slotStart: string }) => Promise<boolean>;
  sendConfirmation: (details: BookingContact & { slotStart: string }, inviteIcs?: string) => Promise<boolean>;
  organizerEmail: string;
}

let mailLanePromise: Promise<BookingMailLane> | null = null;
function defaultMailLane(): Promise<BookingMailLane> {
  if (!mailLanePromise) {
    mailLanePromise = import('./hostinger-mail.ts').then(m => ({
      sendAlert: (details) => m.trySend(m.bookingAlert(details)),
      sendConfirmation: (details, ics) => m.trySend(m.bookingConfirmation(details, ics)),
      organizerEmail: m.OWNER_MAILBOX,
    }));
  }
  return mailLanePromise;
}

/** Test seam: replace the mail lane (unit tests) — production passes nothing. */
export interface BookingConfirmDeps {
  mailLane?: BookingMailLane;
}

export type ConfirmationSms = 'sent' | 'failed' | 'not_consented' | 'no_phone' | 'opted_out' | 'unavailable';

export interface BookingContact {
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  notes?: string;
}

export interface BookingResultLike {
  ok?: boolean;
  bookingId?: string;
  slotStart?: string;
}

/**
 * Fire the full confirmation pack for a booking that already succeeded
 * (bookPlatformCall returned ok). Emails are best-effort (trySend never
 * throws); the SMS is gated and exactly-once as described above.
 * Returns the SMS outcome plus `emailSent`: whether the confirmation
 * EMAIL send itself succeeded (the alert is owner-side and silent), so
 * callers that speak confirmations can be truthful per channel.
 */
export async function sendBookingConfirmations(
  db: any,
  result: BookingResultLike,
  details: BookingContact & { slotStart: string; smsConsent?: boolean },
  deps: BookingConfirmDeps = {},
): Promise<{ confirmationSms: ConfirmationSms; emailSent: boolean }> {
  let confirmationSms: ConfirmationSms = 'not_consented';
  if (!result.ok) return { confirmationSms, emailSent: false };
  const mail = deps.mailLane ?? await defaultMailLane();
  const inviteIcs = result.bookingId
    ? buildBookingInviteIcs({
        name: details.name, email: details.email, phone: details.phone || undefined,
        businessName: details.businessName || undefined, notes: details.notes || undefined,
        slotStart: details.slotStart, bookingId: result.bookingId, organizerEmail: mail.organizerEmail,
      })
    : undefined;
  const [, emailSent] = await Promise.all([mail.sendAlert(details), mail.sendConfirmation(details, inviteIcs)]);
  // Confirmation text: only with explicit SMS consent + a usable phone +
  // no opt-out, exactly once — the row stamp and the delivery-ledger
  // template both guard a retry, and stamping happens BEFORE the send so
  // a crashed request can't double-text.
  const to = normalizePhoneE164(details.phone);
  if (details.smsConsent && to && result.bookingId) {
    try {
      if (await isSmsOptedOut(db, to)) confirmationSms = 'opted_out';
      else {
        const stamp = new Date().toISOString();
        const { data: claimed, error: claimErr } = await db.from('implementation_calls').update({ confirmation_sms_sent_at: stamp }).eq('id', result.bookingId).is('confirmation_sms_sent_at', null).select('id');
        if (claimErr) confirmationSms = 'unavailable'; // followup-pack migration not applied yet
        else if (!claimed?.length) confirmationSms = 'sent'; // already claimed by an earlier attempt
        else {
          const sms = await trySendFollowupSms(db, { to, body: buildBookingConfirmationSms({ slotStartIso: details.slotStart, durationMinutes: SLOT_MINUTES, name: details.name }), templateId: 'booking_confirmation', bookingId: result.bookingId });
          confirmationSms = sms.sent ? 'sent' : 'failed';
          // A failed send releases the claim so the sweep/a retry can try once more.
          if (!sms.sent) await db.from('implementation_calls').update({ confirmation_sms_sent_at: null }).eq('id', result.bookingId);
        }
      }
    } catch (e) { console.error('booking confirmation SMS failed', e instanceof Error ? e.message : e); confirmationSms = 'failed'; }
  } else if (details.smsConsent && !to) confirmationSms = 'no_phone';
  return { confirmationSms, emailSent };
}

/**
 * Book a platform call AND fire the confirmation pack — the single entry
 * point the in-conversation booking tools (website + phone) use. Returns
 * bookPlatformCall's result plus the confirmation outcomes so the agent
 * can speak the instant confirmation only when it is true.
 */
export async function bookCallWithConfirmations(
  db: any,
  details: BookingContact & { slotStart: string; smsConsent?: boolean },
  deps: BookingConfirmDeps = {},
): Promise<BookingResultLike & { confirmationSms: ConfirmationSms; emailSent: boolean }> {
  const result = await bookPlatformCall(db, details) as BookingResultLike;
  if (!result.ok) return { ...result, confirmationSms: 'not_consented', emailSent: false };
  const { confirmationSms, emailSent } = await sendBookingConfirmations(db, result, details, deps);
  return { ...result, confirmationSms, emailSent };
}
