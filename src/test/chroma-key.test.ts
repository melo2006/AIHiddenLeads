import { describe, expect, it } from "vitest";
import { chromaAlpha, despill } from "@/lib/chromaKey";

describe("live face background cut-out", () => {
  it("makes Simli's key-green backdrop fully transparent", () => {
    expect(chromaAlpha(0, 1, 0)).toBe(0);
  });
  it("keeps Aspen's skin, blonde hair and navy suit fully opaque", () => {
    expect(chromaAlpha(0.93, 0.76, 0.66)).toBe(1); // skin
    expect(chromaAlpha(0.86, 0.72, 0.45)).toBe(1); // blonde hair
    expect(chromaAlpha(0.1, 0.12, 0.25)).toBe(1); // navy suit
    expect(chromaAlpha(1, 1, 1)).toBe(1); // white shirt
  });
  it("removes green spill from edges", () => {
    expect(despill(0.5, 0.9, 0.4)).toBe(0.5);
  });
});

import { opaqueBounds, centeringShift } from '@/lib/chromaKey';
describe('person re-centring', () => {
  it('shifts a right-offset person back to centre', () => {
    const w = 10, h = 2, d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { d[i * 4 + 1] = 255; d[i * 4 + 3] = 255; }
    for (const x of [6, 7, 8, 9]) for (const y of [0, 1]) { const i = (y * w + x) * 4; d[i] = 200; d[i + 1] = 150; d[i + 2] = 120; }
    const b = opaqueBounds(d, w, h)!;
    expect(b.x0).toBeCloseTo(0.6); expect(centeringShift(b)).toBeCloseTo(-0.3);
  });
});
