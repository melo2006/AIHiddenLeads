// Booking calendar-invite download — the server side of the SHORT link in
// the booking confirmation SMS: https://aihiddenleads.com/cal/<bookingId>.
//
// The .ics served here is rebuilt with the SAME builder the confirmation
// email uses (buildBookingInviteIcs in platform-calendar.ts) from the SAME
// stored booking row, so the text-message invite and the email invite are
// byte-identical for a booking — same UID (derived from the booking id),
// same summary, same description; one source of truth, no second copy of
// the invite content to drift.
//
// Access model: the booking id is an unguessable UUID and is the only key.
// The invite carries exactly the fields the confirmation email's .ics
// already carries for this booking — nothing is added here. Unknown ids
// and cancelled bookings are a plain 404 (no distinction leaked).

import { buildBookingInviteIcs } from './platform-calendar.ts';

/** Must match OWNER_MAILBOX in hostinger-mail.ts (the email invite's organizer). */
export const BOOKING_ICS_ORGANIZER_EMAIL = 'info@aihiddenleads.com';
export const BOOKING_ICS_FILENAME = 'ai-hidden-leads-call.ics';

const BOOKING_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BookingIcsResult =
  | { ok: true; status: 200; ics: string; filename: string; contentType: string; contentDisposition: string }
  | { ok: false; status: 404; error: string };

const notFound = (): BookingIcsResult => ({ ok: false, status: 404, error: 'Booking not found' });

export async function resolveBookingInviteIcs(
  db: any,
  bookingId: string,
  organizerEmail: string = BOOKING_ICS_ORGANIZER_EMAIL,
  now?: Date,
): Promise<BookingIcsResult> {
  const id = String(bookingId ?? '').trim();
  if (!BOOKING_ID_RE.test(id)) return notFound();

  const { data, error } = await db
    .from('implementation_calls')
    .select('id, name, email, phone, business_name, notes, slot_start, status')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return notFound();
  if (String(data.status ?? '') === 'cancelled') return notFound();
  if (!data.name || !data.email || !data.slot_start || !Number.isFinite(Date.parse(String(data.slot_start)))) {
    return notFound();
  }

  const ics = buildBookingInviteIcs({
    name: String(data.name),
    email: String(data.email),
    phone: data.phone ? String(data.phone) : undefined,
    businessName: data.business_name ? String(data.business_name) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
    slotStart: String(data.slot_start),
    bookingId: String(data.id ?? id),
    organizerEmail,
    now,
  });
  return {
    ok: true,
    status: 200,
    ics,
    filename: BOOKING_ICS_FILENAME,
    contentType: 'text/calendar; charset=utf-8',
    contentDisposition: `attachment; filename="${BOOKING_ICS_FILENAME}"`,
  };
}
