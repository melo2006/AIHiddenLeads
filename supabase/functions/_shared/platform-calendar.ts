import { generateSlots, isValidSlot, SLOT_MINUTES } from './booking-slots.ts';
declare const Deno: { env: { get(name: string): string | undefined } };

export const PLATFORM_CALENDAR = 'melo2006@gmail.com';
type Busy = { start: string; end: string };
export function slotIsFree(iso: string, busy: Busy[]) {
  const start = Date.parse(iso), end = start + SLOT_MINUTES * 60000;
  return busy.every(b => end <= Date.parse(b.start) || start >= Date.parse(b.end));
}
export async function calendarRequest(path: string, body: unknown) {
  const key = Deno.env.get('GOOGLE_CALENDAR_API_KEY'), gatewayKey = Deno.env.get('LOVABLE_API_KEY');
  if (!key || !gatewayKey) throw new Error('Google Calendar is not connected. No availability or booking can be confirmed.');
  const res = await fetch(`https://connector-gateway.lovable.dev/google_calendar/calendar/v3${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${gatewayKey}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Calendar request failed (${res.status}). No appointment has been confirmed.`);
  return res.json();
}
export async function platformAvailability(db: any) {
  const slots = generateSlots();
  if (!slots.length) return [];
  const result = await calendarRequest('/freeBusy', {
    timeMin: slots[0].iso, timeMax: new Date(Date.parse(slots[slots.length - 1].iso) + SLOT_MINUTES * 60000).toISOString(), items: [{ id: PLATFORM_CALENDAR }],
  });
  const calendar = result.calendars?.[PLATFORM_CALENDAR];
  if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error('Google Calendar availability could not be verified.');
  const { data, error } = await db.from('implementation_calls').select('slot_start').neq('status', 'cancelled').gte('slot_start', slots[0].iso);
  if (error) throw new Error('Appointment availability could not be checked.');
  const taken = new Set((data || []).map((r: { slot_start: string }) => new Date(r.slot_start).toISOString()));
  return slots.filter(s => !taken.has(s.iso) && slotIsFree(s.iso, calendar.busy));
}
export async function bookPlatformCall(db: any, details: { name: string; email: string; phone?: string; businessName?: string; notes?: string; slotStart: string }) {
  if (!isValidSlot(details.slotStart)) throw new Error('Choose an upcoming 15-minute weekday slot during 9 AM–5 PM Eastern, at least two hours ahead.');
  const available = await platformAvailability(db);
  if (!available.some(s => s.iso === details.slotStart)) throw new Error('That time is not available on the sales calendar. Please choose another.');
  const { data, error } = await db.from('implementation_calls').insert({ name: details.name, email: details.email, phone: details.phone || null, business_name: details.businessName || null, notes: details.notes || null, slot_start: details.slotStart, status: 'pending' }).select('id').single();
  if (error || !data) throw new Error('That appointment could not be reserved. Please refresh availability.');
  try {
    // Deterministic id prevents duplicate events when a provider response is lost.
    const eventId = data.id.replace(/-/g, '');
    const event = await calendarRequest(`/calendars/${encodeURIComponent(PLATFORM_CALENDAR)}/events?sendUpdates=none`, {
      id: eventId, summary: `AI Hidden Leads implementation call — ${details.name}`,
      description: `Confirmed by visitor for AI Hidden Leads, not the simulated business.\nName: ${details.name}\nEmail: ${details.email}\nPhone: ${details.phone || 'Not supplied'}\nBusiness: ${details.businessName || ''}\n${details.notes || ''}`,
      start: { dateTime: details.slotStart }, end: { dateTime: new Date(Date.parse(details.slotStart) + SLOT_MINUTES * 60000).toISOString() },
    });
    if (!event.id) throw new Error('Calendar did not confirm the appointment.');
    const { error: updateError } = await db.from('implementation_calls').update({ status: 'confirmed' }).eq('id', data.id);
    if (updateError) return { ok: true, calendarConfirmed: true, slotStart: details.slotStart, warning: 'Calendar event saved; appointment record reconciliation needed.' };
    return { ok: true, calendarConfirmed: true, slotStart: details.slotStart };
  } catch (e) {
    // Keep the reservation on uncertain provider failures; do not retry or offer this slot again.
    throw e;
  }
}