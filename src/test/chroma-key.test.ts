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

import { opaqueBounds, centeringShift, SARA_CHROMA_KEY_PROFILE, MONICA_CHROMA_KEY_PROFILE, chromaKeyProfileForPersona, chromaAlphaSpatial } from '@/lib/chromaKey';

describe("Monica's dark hair is subject, not padding (2026-11-22 see-through hair fix)", () => {
  const M = MONICA_CHROMA_KEY_PROFILE;
  const alphaM = (r: number, g: number, b: number) => chromaAlpha(r, g, b, M.low, M.high, M.blackLow, M.blackHigh);
  it("keys her encoded key-green backdrop fully transparent (the asset is not the problem)", () => {
    // Her live backdrop measures (0, 0.847, 0) after encoding — CbCr
    // distance 0.082 from pure green, far below the key band.
    expect(alphaM(0, 0.847, 0)).toBe(0);
  });
  it("keeps her measured dark-hair pixels opaque — they leaked under the shared band", () => {
    // Pixel values sampled from Monica's RAW live frames (2026-11-22),
    // in the hair masses beside her cheeks.
    expect(alphaM(0.020, 0.012, 0.008)).toBe(1); // her median leaked hair pixel
    expect(alphaM(0.016, 0.004, 0.000)).toBeGreaterThan(0.9);
    expect(alphaM(0.027, 0.016, 0.012)).toBe(1);
    // The defect, for the record: the shared padding band ate them.
    expect(chromaAlpha(0.020, 0.012, 0.008)).toBeLessThan(0.3);
    expect(chromaAlpha(0.016, 0.004, 0.000)).toBeLessThan(0.15);
  });
  it("still keys true black fully transparent under her profile (her stream has no padding, but black is black)", () => {
    expect(alphaM(0, 0, 0)).toBe(0);
    expect(alphaM(0.002, 0.002, 0.002)).toBe(0);
    expect(alphaM(0.004, 0.004, 0.004)).toBeLessThan(0.15);
  });
  it("composites her dark hair over a white page as hair, not a bright streak", () => {
    const a = alphaM(0.020, 0.012, 0.008);
    expect(Math.max(0.020 * a + (1 - a), 0.012 * a + (1 - a), 0.008 * a + (1 - a))).toBeLessThan(0.3);
  });
  it("routes only sara and latina to per-persona profiles; Aspen keeps the shared defaults", () => {
    expect(chromaKeyProfileForPersona('latina')).toBe(MONICA_CHROMA_KEY_PROFILE);
    expect(chromaKeyProfileForPersona('sara')).toBe(SARA_CHROMA_KEY_PROFILE);
    expect(chromaKeyProfileForPersona('aspen')).toBeUndefined();
    expect(chromaKeyProfileForPersona('frank')).toBeUndefined();
    expect(chromaKeyProfileForPersona(undefined)).toBeUndefined();
  });
});

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

describe("Monica round 2 — the dark-core fill closes the crushed-black holes (2026-11-22 retest)", () => {
  const M = MONICA_CHROMA_KEY_PROFILE;
  const alphaM = (r: number, g: number, b: number) => chromaAlpha(r, g, b, M.low, M.high, M.blackLow, M.blackHigh);
  // REAL measured pixels: an 11×11 patch from Monica's RAW live frame
  // (Aurelia Perez demo, 2026-11-22) centred on the worst residual
  // hole — the crushed-black core in the hair mass at the top of her
  // head. Values are the frame's actual [R,G,B] triples (0–255).
  const PATCH: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
    [[7, 1, 0], [4, 0, 1], [1, 0, 0], [0, 0, 0], [0, 0, 0], [6, 3, 3], [7, 3, 2], [12, 7, 6], [19, 13, 10], [20, 13, 9], [32, 24, 20]],
    [[6, 0, 0], [2, 0, 0], [2, 1, 2], [0, 0, 0], [1, 0, 0], [3, 1, 1], [7, 3, 2], [11, 6, 4], [15, 9, 7], [20, 13, 9], [29, 21, 16]],
    [[5, 0, 0], [3, 0, 0], [4, 2, 3], [0, 0, 0], [3, 1, 2], [3, 1, 1], [5, 2, 1], [8, 4, 2], [13, 7, 5], [19, 13, 10], [25, 17, 13]],
    [[10, 2, 0], [4, 0, 0], [2, 0, 0], [0, 0, 0], [2, 0, 0], [3, 1, 1], [2, 0, 0], [6, 3, 1], [12, 7, 6], [16, 11, 8], [22, 14, 11]],
    [[10, 2, 0], [4, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [1, 0, 0], [1, 0, 0], [3, 1, 0], [6, 3, 2], [13, 8, 7], [19, 11, 10]],
    [[9, 1, 0], [5, 0, 0], [1, 0, 0], [0, 0, 0], [0, 0, 0], [2, 1, 1], [0, 0, 0], [1, 0, 0], [4, 2, 2], [10, 6, 6], [18, 12, 11]],
    [[11, 2, 0], [6, 0, 0], [3, 1, 1], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [4, 2, 2], [10, 6, 6], [17, 12, 11]],
    [[13, 3, 0], [6, 0, 0], [3, 1, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [3, 1, 1], [7, 4, 4], [17, 12, 11]],
    [[17, 6, 2], [9, 2, 0], [3, 1, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [3, 1, 1], [7, 4, 4], [15, 9, 9]],
    [[20, 7, 2], [11, 3, 0], [2, 0, 0], [0, 0, 0], [0, 2, 1], [0, 0, 0], [0, 0, 0], [0, 0, 0], [1, 0, 0], [5, 2, 2], [12, 7, 7]],
    [[23, 9, 3], [14, 5, 1], [4, 1, 0], [2, 3, 0], [0, 0, 0], [0, 2, 1], [0, 0, 0], [0, 0, 0], [3, 1, 1], [7, 4, 4], [10, 6, 5]],
  ];
  const PW = 11, PH = 11;
  const patchData = new Uint8ClampedArray(PW * PH * 4);
  PATCH.forEach((row, y) => row.forEach(([r, g, b], x) => {
    const i = (y * PW + x) * 4;
    patchData[i] = r; patchData[i + 1] = g; patchData[i + 2] = b; patchData[i + 3] = 255;
  }));

  it("only Monica's profile carries the fill; the per-pixel residue is real (40 of 121 patch pixels under 0.5)", () => {
    expect(M.darkFillRadius).toBe(2);
    expect('darkFillRadius' in SARA_CHROMA_KEY_PROFILE).toBe(false);
    let under = 0;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const [r, g, b] = PATCH[y][x];
      if (alphaM(r / 255, g / 255, b / 255) < 0.5) under++;
    }
    expect(under).toBe(40);
  });
  it("the fill closes every hole in the measured patch (0 of 121 under 0.5, min 0.625)", () => {
    let under = 0; let min = 1;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const a = chromaAlphaSpatial(patchData, PW, PH, x, y, M);
      if (a < 0.5) under++;
      if (a < min) min = a;
    }
    expect(under).toBe(0);
    expect(min).toBeGreaterThan(0.6);
  });
  it("true black still keys fully transparent under the fill — a uniform black field has no subject in ring reach", () => {
    const black = new Uint8ClampedArray(9 * 9 * 4);
    for (let i = 0; i < 9 * 9; i++) black[i * 4 + 3] = 255;
    expect(chromaAlphaSpatial(black, 9, 9, 4, 4, M)).toBe(0);
    // A uniform CRUSHED field (1,0,0) is not rescued either: the fill
    // only lifts pixels with brighter subject inside the ring.
    const crushed = new Uint8ClampedArray(9 * 9 * 4);
    for (let i = 0; i < 9 * 9; i++) { crushed[i * 4] = 1; crushed[i * 4 + 3] = 255; }
    expect(chromaAlphaSpatial(crushed, 9, 9, 4, 4, M)).toBeLessThan(0.15);
  });
  it("her backdrop still keys to 0 under the fill, even surrounded by hair (the chroma factor gates the fill)", () => {
    const d = new Uint8ClampedArray(5 * 5 * 4);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const i = (y * 5 + x) * 4;
      d[i] = 13; d[i + 1] = 7; d[i + 2] = 5; d[i + 3] = 255; // her measured hair
    }
    const c = (2 * 5 + 2) * 4;
    d[c] = 0; d[c + 1] = 216; d[c + 2] = 0; // her encoded key green (0, 0.847, 0)
    expect(chromaAlphaSpatial(d, 5, 5, 2, 2, M)).toBe(0);
  });
  it("without a fill profile the spatial alpha is exactly the per-pixel alpha (Aspen/Sara untouched)", () => {
    for (const [x, y] of [[0, 0], [5, 5], [3, 7], [10, 10]] as const) {
      const [r, g, b] = PATCH[y][x];
      expect(chromaAlphaSpatial(patchData, PW, PH, x, y)).toBe(chromaAlpha(r / 255, g / 255, b / 255));
      expect(chromaAlphaSpatial(patchData, PW, PH, x, y, SARA_CHROMA_KEY_PROFILE))
        .toBe(chromaAlpha(r / 255, g / 255, b / 255, SARA_CHROMA_KEY_PROFILE.low, SARA_CHROMA_KEY_PROFILE.high));
    }
  });
});
