import { generateSlots, isValidSlot, SLOT_MINUTES, BUSINESS_TZ, etDateStr } from './booking-slots.ts';
declare const Deno: { env: { get(name: string): string | undefined } };

export const PLATFORM_CALENDAR = 'melo2006@gmail.com';
type Busy = { start: string; end: string };
type CalendarEvent = { status?: string; transparency?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } };
// freeBusy merges all-day trips with timed events; read original event boundaries instead.
export function timedBusyIntervals(events: CalendarEvent[]): Busy[] {
  return events.flatMap(event => {
    if (event.status === 'cancelled' || event.transparency === 'transparent' || event.start?.date) return [];
    const start = event.start?.dateTime, end = event.end?.dateTime;
    if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
      throw new Error('A timed calendar event could not be checked. Availability is not confirmed.');
    }
    return [{ start, end }];
  });
}
export function voiceAvailability(slots: ReturnType<typeof generateSlots>, now = new Date(), requestedSlot?: string) {
  const firstThreeDates = new Set(Array.from({ length: 3 }, (_, i) => {
    const date = new Date(now); date.setUTCDate(date.getUTCDate() + i);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }));
  const days = [...new Set(slots.map(s => s.dateStr))].slice(0, 2);
  const requestedTime = requestedSlot ? Date.parse(requestedSlot) : NaN;
  const requested = Number.isFinite(requestedTime) ? new Date(requestedTime).toISOString() : undefined;
  const requestedDate = requested ? etDateStr(new Date(requested)) : undefined;
  const sameDay = slots.filter(s => s.dateStr === requestedDate && Date.parse(s.iso) >= requestedTime);
  const alternatives = requested ? [...sameDay, ...slots.filter(s => !sameDay.some(candidate => candidate.iso === s.iso) && Date.parse(s.iso) >= requestedTime), ...slots.filter(s => Date.parse(s.iso) < requestedTime)].slice(0, 2) : slots.slice(0, 2);
  return {
    platform: 'AI Hidden Leads', timeZone: BUSINESS_TZ, businessHours: 'Weekdays 8 AM–6 PM Eastern', searchDays: 14, durationMinutes: SLOT_MINUTES,
    ...(requested ? { requestedSlot: requested, requestedAvailable: slots.some(s => s.iso === requested), alternatives } : {}),
    nextThreeDaysFull: !slots.some(s => firstThreeDates.has(s.dateStr)),
    nextAvailable: slots[0] || null,
    slots: days.flatMap(day => slots.filter(s => s.dateStr === day)),
  };
}
export function slotIsFree(iso: string, busy: Busy[]) {
  const start = Date.parse(iso), end = start + SLOT_MINUTES * 60000;
  return busy.every(b => end <= Date.parse(b.start) || start >= Date.parse(b.end));
}
export async function calendarRequest(path: string, body?: unknown) {
  const key = Deno.env.get('GOOGLE_CALENDAR_API_KEY'), gatewayKey = Deno.env.get('LOVABLE_API_KEY');
  if (!key || !gatewayKey) throw new Error('Google Calendar is not connected. No availability or booking can be confirmed.');
  const res = await fetch(`https://connector-gateway.lovable.dev/google_calendar/calendar/v3${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${gatewayKey}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Calendar request failed (${res.status}). No appointment has been confirmed.`);
  return res.json();
}
export async function platformAvailability(db: any) {
  const slots = generateSlots();
  if (!slots.length) return [];
  const query = new URLSearchParams({
    timeMin: slots[0].iso, timeMax: new Date(Date.parse(slots[slots.length - 1].iso) + SLOT_MINUTES * 60000).toISOString(),
    singleEvents: 'true', maxResults: '250', fields: 'nextPageToken,items(status,transparency,start,end)',
  });
  const busy: Busy[] = [];
  for (let page = 0; page < 20; page++) {
    const result = await calendarRequest(`/calendars/${encodeURIComponent(PLATFORM_CALENDAR)}/events?${query}`);
    if (!Array.isArray(result.items)) throw new Error('Google Calendar availability could not be verified.');
    busy.push(...timedBusyIntervals(result.items));
    if (!result.nextPageToken) break;
    if (page === 19) throw new Error('Calendar has too many events to verify safely. Please contact our team.');
    query.set('pageToken', result.nextPageToken);
  }
  const { data, error } = await db.from('implementation_calls').select('slot_start').neq('status', 'cancelled').gte('slot_start', slots[0].iso);
  if (error) throw new Error('Appointment availability could not be checked.');
  const taken = new Set((data || []).map((r: { slot_start: string }) => new Date(r.slot_start).toISOString()));
  return slots.filter(s => !taken.has(s.iso) && slotIsFree(s.iso, busy));
}
export async function bookPlatformCall(db: any, details: { name: string; email: string; phone?: string; businessName?: string; notes?: string; slotStart: string }) {
  if (!isValidSlot(details.slotStart)) throw new Error('Choose an upcoming 15-minute weekday slot during 8 AM–6 PM Eastern, at least two hours ahead.');
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
      start: { dateTime: details.slotStart, timeZone: BUSINESS_TZ }, end: { dateTime: new Date(Date.parse(details.slotStart) + SLOT_MINUTES * 60000).toISOString(), timeZone: BUSINESS_TZ },
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