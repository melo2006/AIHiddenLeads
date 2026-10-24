// Slot generation for the free implementation-call booking page.
// Slots are 15 minutes, 9:00–16:45 America/New_York, Monday–Friday, up to 14 days ahead.

export const SLOT_MINUTES = 15;
export const BUSINESS_TZ = "America/New_York";
const START_HOUR = 9;
const END_HOUR = 17; // last slot starts at 16:45
const DAYS_AHEAD = 14;
const MIN_LEAD_HOURS = 2;

const pad = (n: number) => String(n).padStart(2, "0");

/** Convert an America/New_York wall-clock time to a UTC Date. */
export function etWallToUtc(dateStr: string, hour: number, minute: number): Date {
  const wallAsUtc = new Date(`${dateStr}T${pad(hour)}:${pad(minute)}:00Z`);
  // Find the ET offset by formatting an initial guess in ET and comparing.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(wallAsUtc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const etAsUtc = Date.UTC(+get("year"), +get("month") - 1, +get("day"), +get("hour") % 24, +get("minute"));
  const offsetMs = etAsUtc - wallAsUtc.getTime();
  return new Date(wallAsUtc.getTime() - offsetMs);
}

/** ET calendar date (YYYY-MM-DD) for a UTC instant. */
export function etDateStr(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** ET weekday (0=Sunday) for a YYYY-MM-DD ET date. */
export function etWeekday(dateStr: string): number {
  return etWallToUtc(dateStr, 12, 0).getUTCDay() === 0 ? 0 : new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

export interface Slot {
  iso: string; // UTC ISO instant
  dateStr: string; // ET date
  label: string; // e.g. "9:15 AM"
}

export function generateSlots(now: Date = new Date()): Slot[] {
  const slots: Slot[] = [];
  const minStart = now.getTime() + MIN_LEAD_HOURS * 3600_000;
  const todayEt = etDateStr(now);
  const [y, m, d] = todayEt.split("-").map(Number);

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i, 12));
    const dateStr = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue; // weekends off
    for (let mins = START_HOUR * 60; mins < END_HOUR * 60; mins += SLOT_MINUTES) {
      const utc = etWallToUtc(dateStr, Math.floor(mins / 60), mins % 60);
      if (utc.getTime() < minStart) continue;
      const h = Math.floor(mins / 60);
      const h12 = ((h + 11) % 12) + 1;
      slots.push({
        iso: utc.toISOString(),
        dateStr,
        label: `${h12}:${pad(mins % 60)} ${h < 12 ? "AM" : "PM"}`,
      });
    }
  }
  return slots;
}

/** True when an ISO instant is a valid bookable slot (15-min aligned, within ET business hours, weekday, future). */
export function isValidSlot(iso: string, now: Date = new Date()): boolean {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return false;
  return generateSlots(now).some((s) => s.iso === t.toISOString());
}
