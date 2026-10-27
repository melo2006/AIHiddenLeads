import { describe, it, expect } from "vitest";
import { rangeStart, rangeEnd, bucketKey, projectMonthEnd } from "./voiceUsageFilters";

const now = new Date(2026, 9, 11, 12, 0, 0); // Oct 11, noon local

describe("voice usage filters", () => {
  it("this month starts on the 1st", () => {
    expect(rangeStart("month", now)).toBe(new Date(2026, 9, 1).getTime());
  });
  it("all time has no lower bound", () => {
    expect(rangeStart("all", now)).toBeNull();
  });
  it("custom end includes the whole last day", () => {
    expect(rangeEnd("custom", "2026-10-05")).toBe(new Date(2026, 9, 5, 23, 59, 59, 999).getTime());
  });
  it("buckets by hour", () => {
    expect(bucketKey(new Date(2026, 9, 3, 7, 45).toISOString(), "hour")).toBe("2026-10-03 07:00");
  });
  it("projects month-end linearly ($10 over 10.5 days of 31)", () => {
    expect(projectMonthEnd(10.5, new Date(2026, 9, 11, 12))).toBeCloseTo(31, 5);
  });
});
