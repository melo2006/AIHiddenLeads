export type UsageRange = "today" | "24h" | "7" | "30" | "month" | "all" | "custom";

/** Start timestamp (ms) for a range, or null for no lower bound. */
export function rangeStart(range: UsageRange, now = new Date(), customFrom?: string): number | null {
  const t = now.getTime();
  switch (range) {
    case "today": return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    case "24h": return t - 86400000;
    case "7": return t - 7 * 86400000;
    case "30": return t - 30 * 86400000;
    case "month": return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case "custom": return customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null;
    default: return null;
  }
}

/** Inclusive end-of-day for a custom "to" date, else null. */
export function rangeEnd(range: UsageRange, customTo?: string): number | null {
  return range === "custom" && customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : null;
}

export function bucketKey(iso: string, by: "day" | "hour"): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return by === "day" ? day : `${day} ${p(d.getHours())}:00`;
}

/** Linear month-end projection from month-to-date spend. */
export function projectMonthEnd(monthToDate: number, now = new Date()): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const elapsedDays = Math.max((now.getTime() - start) / 86400000, 1 / 24);
  return (monthToDate / elapsedDays) * daysInMonth;
}
