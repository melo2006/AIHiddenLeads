import { describe, expect, it } from 'vitest';
import { fitFloatingPosition } from '@/lib/floatingViewport';

describe('floating assistant keyboard bounds', () => {
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