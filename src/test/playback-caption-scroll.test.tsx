import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlaybackCaption, { snapScrollTopToLine } from '@/components/PlaybackCaption';

afterEach(() => vi.restoreAllMocks());
describe('active spoken-word scrolling', () => {
  it('scrolls to a later line using consistent viewport coordinates', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: this.tagName === 'SPAN' ? 220 : 100, height: this.tagName === 'SPAN' ? 24 : 58 } as DOMRect;
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(58);
    const view = render(<PlaybackCaption caption={{ text: 'One two three four five six seven eight nine ten', word: 9, highlightEnd: 10 }} />);
    // The raw centering math gives 103 (120 - (58-24)/2); Publish #56
    // snaps the rest position to the nearest whole-line boundary
    // (96 = 4 x 24px lines) so no line is ever parked half-cut.
    expect(view.getByLabelText('Live playback captions').scrollTop).toBe(96);
  });
});

describe('caption scroll line snap (Publish #56 — no mid-line clipping)', () => {
  it('snaps to the nearest multiple of the 24px line height', () => {
    expect(snapScrollTopToLine(0)).toBe(0);
    expect(snapScrollTopToLine(11)).toBe(0);
    expect(snapScrollTopToLine(12)).toBe(24);
    expect(snapScrollTopToLine(103)).toBe(96);
    expect(snapScrollTopToLine(120)).toBe(120);
    expect(snapScrollTopToLine(131)).toBe(120);
    expect(snapScrollTopToLine(133)).toBe(144);
  });

  it('never returns a negative or non-finite position', () => {
    expect(snapScrollTopToLine(-30)).toBe(0);
    expect(snapScrollTopToLine(Number.NaN)).toBe(0);
    expect(snapScrollTopToLine(50, 0)).toBe(50);
  });
});