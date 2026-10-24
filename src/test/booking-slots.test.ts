// @vitest-environment node
import { describe, expect, it } from "vitest";
import { etWallToUtc, generateSlots, isValidSlot, SLOT_MINUTES } from "@/lib/bookingSlots";

describe("booking slot generation", () => {
  it("slots are 15 minutes long", () => {
    expect(SLOT_MINUTES).toBe(15);
  });

  it("converts ET wall time to UTC correctly (EST, winter)", () => {
    // 9:00 AM ET in January = 14:00 UTC (EST, UTC-5)
    expect(etWallToUtc("2026-01-05", 9, 0).toISOString()).toBe("2026-01-05T14:00:00.000Z");
  });

  it("converts ET wall time to UTC correctly (EDT, summer)", () => {
    // 9:00 AM ET in July = 13:00 UTC (EDT, UTC-4)
    expect(etWallToUtc("2026-07-06", 9, 0).toISOString()).toBe("2026-07-06T13:00:00.000Z");
  });

  it("generates only weekday slots within 9:00-17:00 ET", () => {
    const now = new Date("2026-01-05T10:00:00Z"); // Monday 5AM ET
    const slots = generateSlots(now);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const day = new Date(`${s.dateStr}T12:00:00Z`).getUTCDay();
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
      expect(s.label).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    }
    // First slot of any day is 9:00 AM, last is 4:45 PM
    const byDay = new Map<string, string[]>();
    for (const s of slots) {
      byDay.set(s.dateStr, [...(byDay.get(s.dateStr) ?? []), s.label]);
    }
    for (const labels of byDay.values()) {
      expect(labels[0]).toBe("9:00 AM");
      expect(labels[labels.length - 1]).toBe("4:45 PM");
    }
  });

  it("excludes slots sooner than 2 hours from now", () => {
    const now = new Date("2026-01-05T15:30:00Z"); // Monday 10:30 AM ET
    const slots = generateSlots(now);
    const today = slots.filter((s) => s.dateStr === "2026-01-05");
    // 10:30 AM ET + 2h = 12:30 PM ET → first available is 12:30 PM or later
    expect(today[0]?.label).toBe("12:30 PM");
  });

  it("validates only generated slots", () => {
    const now = new Date("2026-01-05T10:00:00Z");
    const slots = generateSlots(now);
    expect(isValidSlot(slots[0].iso, now)).toBe(true);
    expect(isValidSlot("2020-01-01T14:00:00.000Z", now)).toBe(false);
    expect(isValidSlot("not-a-date", now)).toBe(false);
  });
});
