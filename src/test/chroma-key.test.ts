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

import { opaqueBounds, centeringShift, SARA_CHROMA_KEY_PROFILE } from '@/lib/chromaKey';

/** Composite one keyed pixel over a white page, exactly as the browser
 *  does with the shader's premultiplied output (despill applied first). */
const overWhite = (r: number, g: number, b: number, low?: number, high?: number) => {
  const a = chromaAlpha(r, g, b, low, high);
  return [r, despill(r, g, b), b].map(c => c * a + (1 - a));
};

describe("dark detail is subject, not padding (2026-11-20 zombie-eyes fix)", () => {
  it("still keys true black padding fully transparent", () => {
    expect(chromaAlpha(0, 0, 0)).toBe(0);
    expect(chromaAlpha(0.01, 0.01, 0.01)).toBe(0); // encoder ringing on black
    expect(chromaAlpha(0.02, 0.02, 0.02)).toBeLessThan(0.3);
  });
  it("keeps pupils, lashes and shadowed dark hair opaque", () => {
    expect(chromaAlpha(0.05, 0.04, 0.035)).toBe(1); // pupil
    expect(chromaAlpha(0.055, 0.045, 0.04)).toBe(1); // shadowed dark hair (Sara, Denise, Monica)
    // Lash line: the old 0.02–0.06 black band left this at ≈0.16 alpha.
    expect(chromaAlpha(0.03, 0.026, 0.022)).toBeGreaterThan(0.7);
  });
  it("composites eye detail over a white page as dark, not washed out", () => {
    for (const px of [[0.05, 0.04, 0.035], [0.03, 0.026, 0.022]] as const) {
      const [r, g, b] = overWhite(px[0], px[1], px[2]);
      expect(Math.max(r, g, b)).toBeLessThan(0.3);
    }
  });
  it("Sara's rebalanced profile restores her hair-edge blends while still suppressing the halo pixel", () => {
    const { low, high } = SARA_CHROMA_KEY_PROFILE;
    // 70% key green / 30% skin — a wispy hair-edge blend.
    expect(chromaAlpha(0.28, 0.93, 0.2, low, high)).toBeGreaterThan(0.2);
    expect(chromaAlpha(0.28, 0.93, 0.2, low, high)).toBeGreaterThan(chromaAlpha(0.28, 0.93, 0.2, 0.16, 0.26));
    // The Nov-13 halo pixel stays ~3x more transparent than under the shared default.
    expect(chromaAlpha(0.2, 0.9, 0.2, low, high)).toBeLessThan(0.15);
    expect(chromaAlpha(0.2, 0.9, 0.2, low, high)).toBeLessThan(chromaAlpha(0.2, 0.9, 0.2));
  });
});
describe('person re-centring', () => {
  it('shifts a right-offset person back to centre', () => {
    const w = 10, h = 2, d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { d[i * 4 + 1] = 255; d[i * 4 + 3] = 255; }
    for (const x of [6, 7, 8, 9]) for (const y of [0, 1]) { const i = (y * w + x) * 4; d[i] = 200; d[i + 1] = 150; d[i + 2] = 120; }
    const b = opaqueBounds(d, w, h)!;
    expect(b.x0).toBeCloseTo(0.6); expect(centeringShift(b)).toBeCloseTo(-0.3);
  });
});
