// Rate witness math (Publish #54): fed duration vs the heard
// terminal's own clock advance, per completed utterance. A
// healthy terminal reads ≈1.00; a mis-rated one reads its
// factor. These tests pin the ratio definition with fakes —
// matched clocks, and the exact factor for the investigation's
// canonical case (24 kHz-fed audio consumed as if 48 kHz).
import { describe, expect, it } from "vitest";
import { createRateWitness, noteRateUtterance, rateRatio, resetRateWitness } from "@/lib/rateWitness";

describe("rateRatio", () => {
  it("matched clocks read 1.00", () => {
    expect(rateRatio(2.5, 2.5)).toBe(1);
    expect(rateRatio(0.4, 0.4)).toBe(1);
  });

  it("24k-fed / 48k-played reads the exact factor 2.00 (the file burns in half the clock)", () => {
    // 48,000 samples fed at 24 kHz = 2.00 s of speech; a terminal
    // that treats them as 48 kHz plays them in 1.00 s of its own
    // timeline — the wandering voice's racing extreme.
    expect(rateRatio(2.0, 1.0)).toBe(2);
  });

  it("a dragging terminal reads below 1 (48k-fed / 24k-played = 0.50)", () => {
    expect(rateRatio(1.0, 2.0)).toBe(0.5);
  });

  it("unusable measurements are discarded, never averaged in", () => {
    expect(rateRatio(0, 1)).toBeNull();
    expect(rateRatio(1, 0)).toBeNull();
    expect(rateRatio(-1, 1)).toBeNull();
    expect(rateRatio(Number.NaN, 1)).toBeNull();
    expect(rateRatio(1, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("noteRateUtterance / aggregate", () => {
  it("aggregates min / max / last across utterances", () => {
    const w = createRateWitness();
    expect(noteRateUtterance(w, 2.0, 2.0)).toBe(1);
    expect(noteRateUtterance(w, 2.0, 1.0)).toBe(2);
    expect(noteRateUtterance(w, 4.0, 5.0)).toBe(0.8);
    expect(w.count).toBe(3);
    expect(w.min).toBe(0.8);
    expect(w.max).toBe(2);
    expect(w.last).toBe(0.8);
  });

  it("a discarded utterance leaves the aggregate untouched", () => {
    const w = createRateWitness();
    noteRateUtterance(w, 1, 1);
    expect(noteRateUtterance(w, 3, 0)).toBeNull();
    expect(w.count).toBe(1);
    expect(w.min).toBe(1);
    expect(w.max).toBe(1);
  });

  it("reset returns to the empty aggregate (a new session inherits nothing)", () => {
    const w = createRateWitness();
    noteRateUtterance(w, 2, 1);
    resetRateWitness(w);
    expect(w).toEqual({ count: 0, min: null, max: null, last: null });
  });
});
