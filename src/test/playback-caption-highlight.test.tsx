import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlaybackCaption from '@/components/PlaybackCaption';

// The highlight is a two-word window (CAPTION_HIGHLIGHT_WORDS): positions are
// estimates, so the current word and the next one light up together and the
// heard word stays inside the highlight when the estimate is off by one.
const lit = (view: ReturnType<typeof render>) =>
  Array.from(view.getByLabelText('Live playback captions').querySelectorAll('span'))
    .map(s => s.className.includes('bg-primary'));

describe('caption highlight window', () => {
  it('highlights the current word and the next one together', () => {
    const view = render(<PlaybackCaption caption={{ text: 'One two three four', word: 1, highlightEnd: 3 }} />);
    expect(lit(view)).toEqual([false, true, true, false]);
  });
  it('highlights only the final word at the end of a run', () => {
    const view = render(<PlaybackCaption caption={{ text: 'One two three four', word: 3, highlightEnd: 4 }} />);
    expect(lit(view)).toEqual([false, false, false, true]);
  });
  it('highlights nothing when the panel marks playback stopped (word -1)', () => {
    const view = render(<PlaybackCaption caption={{ text: 'One two three four', word: -1, highlightEnd: 3 }} />);
    expect(lit(view)).toEqual([false, false, false, false]);
  });
});
