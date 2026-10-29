import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlaybackCaption from '@/components/PlaybackCaption';

afterEach(() => vi.restoreAllMocks());
describe('active spoken-word scrolling', () => {
  it('scrolls to a later line using consistent viewport coordinates', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: this.tagName === 'SPAN' ? 220 : 100, height: this.tagName === 'SPAN' ? 24 : 58 } as DOMRect;
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(58);
    const view = render(<PlaybackCaption caption={{ text: 'One two three four five six seven eight nine ten', word: 9 }} />);
    expect(view.getByLabelText('Live playback captions').scrollTop).toBe(103);
  });
});