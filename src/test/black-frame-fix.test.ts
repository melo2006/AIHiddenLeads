import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Ron's black-frame report (2026-11-11): while the widget sat in
// "Connecting…", Aspen's face appeared inside thick black bars instead of
// filling her frame; the bars vanished once the live (chroma-keyed) face
// took over. Root cause, proven by a headless render probe: in the
// pre-live state the ONLY visible painter inside .aspen-person-livebox is
// the still portrait <img>, and the still asset itself —
// src/assets/aspen-video-frame-final.webp, a captured Simli frame — had
// the stream's pure-black padding baked in as OPAQUE bands at its edges
// (alpha 255, RGB 0 at every corner), while the rest of the cutout
// surround is transparent. The fix cleared the border-connected black
// padding to transparency so the portrait element's own theme-tone
// backdrop (the radial gradient on .aspen-person-portrait) shows there —
// the panel's tone, never black. The pixel-level proof lives in the
// render verification (report: black-frame-fix-report-2026-11-11.md);
// these pins lock the layout contract the fix relies on.
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
const simli = readFileSync(resolve(__dirname, '../components/SimliAvatar.tsx'), 'utf8');
const frame = readFileSync(resolve(__dirname, '../components/FloatingPersonFrame.tsx'), 'utf8');

describe('black frame fix — portrait fills its frame in every state', () => {
  it('the livebox clips to one fixed box and the portrait fills it edge-to-edge', () => {
    expect(css).toContain('.aspen-person-livebox { position: relative; z-index: 0; width: 234px; height: 188px; flex-shrink: 0; overflow: hidden; }');
    expect(css).toContain('.aspen-person-shell .aspen-person-livebox .aspen-person-portrait { width: 100%; height: 100%; display: block; }');
  });

  it('the portrait backdrop is the panel theme gradient, never black', () => {
    const rule = css.match(/\.aspen-person-portrait \{ background: ([^}]+)\}/);
    expect(rule).toBeTruthy();
    expect(rule![1]).toContain('radial-gradient');
    expect(rule![1]).toContain('hsl(var(--primary)');
    expect(rule![1]).toContain('hsl(var(--muted)');
    expect(rule![1]).not.toContain('#000');
    expect(rule![1]).not.toContain('black');
  });

  it('the still portrait renders with cover framing (face-dominant, no letterbox)', () => {
    expect(frame).toContain('aspen-person-portrait mx-auto object-cover object-top');
    expect(css).toContain('.aspen-person-portrait { width: 234px; height: 188px; flex-shrink: 0; object-fit: cover; object-position: top center; }');
  });

  it('the live media uses the same cover framing as the still it replaces', () => {
    expect(css).toContain('.aspen-person-live-media { object-fit: cover; object-position: top center; }');
    // Unboxed (in-frame) Simli video + keyed canvas both carry the cover classes.
    expect(simli).toContain("unboxed ? 'object-cover object-top aspen-person-live-media' : 'object-contain'");
    // The unboxed container itself paints no background of its own.
    expect(simli).not.toContain("unboxed ? 'absolute inset-0 bg-black");
  });

  it('the still asset is an alpha cutout (WebP with an alpha-capable encoding)', () => {
    const bytes = readFileSync(resolve(__dirname, '../assets/aspen-video-frame-final.webp'));
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    const header = bytes.subarray(0, 64).toString('ascii');
    // VP8L (lossless, always alpha) or VP8X with the alpha flag set: the
    // repaired still ships lossless VP8L. An opaque VP8 frame grab (no
    // alpha channel at all) must never come back.
    const isLossless = header.includes('VP8L');
    const hasAlphaFlag = header.includes('VP8X') && (bytes[20] & 0x10) !== 0;
    expect(isLossless || hasAlphaFlag).toBe(true);
  });
});
