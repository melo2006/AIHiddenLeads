import { describe, expect, it } from 'vitest';
import { fitFloatingPosition, floatingCornerPosition } from '@/lib/floatingViewport';

describe('floating assistant keyboard bounds', () => {
  it('anchors to the lower right after a short loading viewport expands', () => {
    const size = { width: 181, height: 124 };
    expect(floatingCornerPosition(size, { left: 0, top: 0, width: 707, height: 180 })).toEqual({ x: 514, y: 44 });
    expect(floatingCornerPosition(size, { left: 0, top: 0, width: 707, height: 633 })).toEqual({ x: 514, y: 497 });
  });
  it('reanchors an expanded chat window after the keyboard closes', () => {
    const size = { width: 380, height: 310 };
    expect(floatingCornerPosition(size, { left: 0, top: 0, width: 707, height: 350 })).toEqual({ x: 315, y: 28 });
    expect(floatingCornerPosition(size, { left: 0, top: 0, width: 707, height: 633 })).toEqual({ x: 315, y: 311 });
  });
  it('keeps the composer above a reduced keyboard viewport', () => {
    const result = fitFloatingPosition({ x: 315, y: 250 }, { width: 380, height: 310 }, { left: 0, top: 0, width: 707, height: 350 });
    expect(result.y).toBe(28);
    expect(result.y + 310).toBeLessThanOrEqual(338);
  });
  it('restores the original position after the keyboard closes', () => {
    const original = { x: 315, y: 250 };
    fitFloatingPosition(original, { width: 380, height: 310 }, { left: 0, top: 0, width: 707, height: 350 });
    expect(fitFloatingPosition(original, { width: 380, height: 310 }, { left: 0, top: 0, width: 707, height: 633 })).toEqual(original);
  });
});