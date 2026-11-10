// Aspen in-conversation booking tools (Follow-up pack phase 2) — PURE logic.
//
// The tool executors in the edge functions (gemini-live-proxy for the
// website voice path, telephony-stream for the phone path) call into this
// module for everything deterministic: the offer-set selection algorithm
// (Ron's approved slot-offer method, ~/workspace/aspen-slot-offer-script-
// 2026-11-11.md), spoken slot labels, day-part parsing of a caller-named
// time, and check_time resolution. Side effects (availability reads,
// calendar writes, confirmation mail/SMS) stay in the callers and in
// _shared/booking-confirm.ts; this module never touches the DB or network
// so the whole method is unit-testable under vitest/node, same pattern as
// phone-demo.ts / followup.ts.

import { etDateStr, etWallToUtc, type Slot } from './booking-slots.ts';

export type DayPart = 'morning' | 'midday' | 'afternoon';

export interface BookingToolSlot extends Slot {
  /** "Tuesday, November 18 at 11 AM Eastern" — weekday + date + time + zone. */
  spokenLabel: string;
  dayPart: DayPart;
  /** True for the ONE slot closest to the caller's stated preference (the gentle anchor). */
  recommended?: boolean;
}

export interface OfferPreference {
  /** ET calendar dates (YYYY-MM-DD), nearest/most-preferred first. */
  preferredDates?: string[];
  /** Preferred day-part; null/undefined = no preference stated. */
  dayPart?: DayPart | null;
}

/** ET day-part for a UTC instant: morning < 12:00, midday 12:00–13:59, afternoon ≥ 14:00. */
export function dayPartForIso(iso: string): DayPart {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));
  return hour < 12 ? 'morning' : hour < 14 ? 'midday' : 'afternoon';
}

/**
 * Spoken label for a slot: "Tuesday, November 18 at 11 AM Eastern".
 * Weekday/date computed in America/New_York so the label always matches
 * the ET wall time the caller hears (correct across DST boundaries).
 * Times carry digits ("11 AM", "2:30 PM"), never spelled-out numbers.
 */
export function spokenSlotLabel(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const minute = get('minute');
  const time = minute === '00' ? `${get('hour')} ${get('dayPeriod')}` : `${get('hour')}:${minute} ${get('dayPeriod')}`;
  return `${get('weekday')}, ${get('month')} ${get('day')} at ${time} Eastern`;
}

/**
 * Merge a tool-model's free-form part-of-day word into a day-part. The
 * booking tools accept 'morning' | 'midday' | 'afternoon' | 'evening';
 * 'evening' means late day (the platform calendar ends at 6 PM Eastern),
 * so it maps to the afternoon day-part.
 */
export function parseDayPart(value: unknown): DayPart | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'morning') return 'morning';
  if (v === 'midday' || v === 'noon' || v === 'mid-day') return 'midday';
  if (v === 'afternoon' || v === 'evening' || v === 'late') return 'afternoon';
  return null;
}

/**
 * Map the caller's stated day keyword (from the preference-first ask) to
 * ordered ET dates: 'today' → [today], 'tomorrow' → [tomorrow],
 * 'day_after' (the next day) → [day after tomorrow]. undefined/null =
 * no stated preference. 'later today' yields only slots that satisfy the
 * ≥2h rule because the input slots already do — the caller must not be
 * offered a same-day time the calendar cannot honor.
 */
export function preferredDatesFor(day: unknown, now: Date = new Date()): string[] | undefined {
  const v = String(day ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const addDays = (dateStr: string, n: number) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  };
  const today = etDateStr(now);
  if (v === 'today') return [today];
  if (v === 'tomorrow') return [addDays(today, 1)];
  if (v === 'day_after' || v === 'next_day' || v === 'dayafter') return [addDays(today, 2)];
  return undefined;
}

// ---------------------------------------------------------------------------
// Offer-set selection (Ron's slot-offer method)
// ---------------------------------------------------------------------------

const MIN_OFFER_GAP_MS = 90 * 60_000;

/**
 * Pick up to 3 REAL slots to offer, per the approved method:
 * - Candidates come only from the supplied availability (never invented).
 * - Preference order: slots on a preferred date + in the preferred
 *   day-part first, then preferred date (any part), then preferred
 *   day-part (any date), then everything else.
 * - Chosen slots are spaced ≥ 90 minutes apart wherever the calendar
 *   allows; with no stated preference the pick spreads across day-parts
 *   (morning / midday / afternoon) first.
 * - If spacing cannot be honored with 3 slots, the set shrinks rather
 *   than packing back-to-back times.
 * - Exactly one slot is marked recommended: the first pick — the one
 *   closest to the caller's stated preference.
 */
export function selectOfferSet(slots: Slot[], preference: OfferPreference = {}, limit = 3): BookingToolSlot[] {
  if (!slots.length) return [];
  const prefDates = preference.preferredDates;
  const prefPart = preference.dayPart ?? null;
  const rank = (s: Slot): number => {
    const dateIdx = prefDates ? prefDates.indexOf(s.dateStr) : -1;
    const onDate = dateIdx >= 0;
    const inPart = prefPart !== null && dayPartForIso(s.iso) === prefPart;
    if (prefDates?.length && prefPart) {
      if (onDate && inPart) return 0;
      if (onDate) return 1;
      if (inPart) return 2;
      return 3;
    }
    if (prefDates?.length) return onDate ? 0 : 1;
    if (prefPart) return inPart ? 0 : 1;
    return 0;
  };
  const ranked = slots
    .map(s => ({ s, r: rank(s) }))
    .sort((a, b) => a.r - b.r || Date.parse(a.s.iso) - Date.parse(b.s.iso));
  const picked: Slot[] = [];
  const tryAdd = (candidate: Slot, spacedOnly: boolean) => {
    if (picked.length >= limit || picked.some(p => p.iso === candidate.iso)) return;
    if (spacedOnly && picked.some(p => Math.abs(Date.parse(p.iso) - Date.parse(candidate.iso)) < MIN_OFFER_GAP_MS)) return;
    picked.push(candidate);
  };
  // Pass 1: best-ranked candidates, spread across day-parts when the
  // caller gave no day-part preference (the "busy calendar" presentation).
  for (const { s } of ranked) {
    if (!prefPart && picked.some(p => dayPartForIso(p.iso) === dayPartForIso(s.iso))) continue;
    tryAdd(s, true);
  }
  // Pass 2: relax the day-part spread (still spaced) to fill the set.
  for (const { s } of ranked) tryAdd(s, true);
  // Pass 3: only when literally nothing spaced remains, allow one tighter
  // pick — two real options beat one, and the gap rule yields to honesty:
  // never invent a slot to fill the set.
  if (picked.length < Math.min(2, slots.length)) for (const { s } of ranked) tryAdd(s, false);
  return picked
    .sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso))
    .map((s, i, arr) => ({
      ...s,
      spokenLabel: spokenSlotLabel(s.iso),
      dayPart: dayPartForIso(s.iso),
      // The anchor is the slot closest to the stated preference — the
      // earliest-ranked pick — or, with no preference, the middle pick
      // (Ron's example anchors the 11 AM between 8:30 and 2).
      recommended: arr.length > 1
        ? (preference.dayPart || preference.preferredDates?.length ? s.iso === ranked.map(r => r.s).find(c => picked.some(p => p.iso === c.iso))?.iso : i === Math.floor(arr.length / 2))
        : true,
    }));
}

// ---------------------------------------------------------------------------
// check_time — the caller names a time; answer honestly.
// ---------------------------------------------------------------------------

/**
 * Resolve a caller-named time to a concrete ET instant. Accepts:
 * - a full ISO datetime (with offset or Z), used as-is;
 * - an ISO date + an "H:MM AM/PM" or "HH:MM" wall time (ET);
 * - structured parts { date: 'YYYY-MM-DD', time: '2:30 PM' } passed as
 *   separate arguments by the caller.
 * Returns null when nothing parseable was given.
 */
export function resolveNamedTime(input: { iso?: unknown; date?: unknown; time?: unknown }): Date | null {
  const isoRaw = String(input.iso ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(isoRaw)) {
    const t = Date.parse(isoRaw);
    if (Number.isFinite(t)) return new Date(t);
  }
  const dateRaw = /^\d{4}-\d{2}-\d{2}$/.test(isoRaw) ? isoRaw : String(input.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return null;
  const timeRaw = String(input.time ?? '').trim();
  const m = timeRaw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return etWallToUtc(dateRaw, hour, minute);
}

export type CheckTimeResult =
  | { bookable: true; slot: BookingToolSlot }
  | { bookable: false; reason: 'invalid' | 'not_a_slot' | 'taken_or_unavailable' | 'past'; requestedIso: string | null; alternatives: BookingToolSlot[] };

/**
 * Check a caller-named time against the real bookable slots (the same
 * slot list bookPlatformCall enforces: 30-min grid, weekday 8–6 ET,
 * ≥2h ahead, not taken). When it is not bookable, return the nearest
 * real alternatives — the same day first, then the next openings —
 * never a fabricated time.
 */
export function checkTimeAvailability(args: { slots: Slot[]; validSlots: Slot[]; named: Date | null; now?: Date }): CheckTimeResult {
  const { slots, validSlots, named } = args;
  if (!named || !Number.isFinite(named.getTime())) {
    return { bookable: false, reason: 'invalid', requestedIso: null, alternatives: selectOfferSet(slots, {}) };
  }
  const requestedIso = named.toISOString();
  const hit = slots.find(s => s.iso === requestedIso);
  if (hit) {
    return { bookable: true, slot: { ...hit, spokenLabel: spokenSlotLabel(hit.iso), dayPart: dayPartForIso(hit.iso) } };
  }
  const reason: 'not_a_slot' | 'taken_or_unavailable' | 'past' =
    (args.now && named.getTime() <= args.now.getTime()) ? 'past'
      : validSlots.some(s => s.iso === requestedIso) ? 'taken_or_unavailable'
        : 'not_a_slot';
  const sameDay = slots.filter(s => s.dateStr === etDateStr(named));
  const after = slots.filter(s => Date.parse(s.iso) > named.getTime() && s.dateStr !== etDateStr(named));
  const before = slots.filter(s => Date.parse(s.iso) < named.getTime());
  const pool = [...sameDay, ...after.slice(0, 6), ...before.slice(-2)];
  return { bookable: false, reason, requestedIso, alternatives: selectOfferSet(pool, {}) };
}
