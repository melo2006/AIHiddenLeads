import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlaybackCaption from '@/components/PlaybackCaption';

// The highlight is the WHOLE segment currently being spoken, as one block:
// word positions are only playback-clock estimates, so a moving word window
// visibly sat on the wrong words. A segment block is either fully lit (while
// it is spoken) or not lit at all (the panel's stopped state).
const lit = (view: ReturnType<typeof render>) =>
  Array.from(view.getByLabelText('Live playback captions').querySelectorAll('span'))
    .map(s => s.className.includes('bg-primary'));

describe('caption segment highlight', () => {
  it('highlights every word of the segment being spoken', () => {
    const view = render(<PlaybackCaption caption={{ text: 'One two three four', speaking: true }} />);
    expect(lit(view)).toEqual([true, true, true, true]);
  });
  it('moves the whole block to the next segment', () => {
    const view = render(<PlaybackCaption caption={{ text: 'First response', speaking: true }} />);
    expect(lit(view)).toEqual([true, true]);
    view.rerender(<PlaybackCaption caption={{ text: 'Next response here', speaking: true }} />);
    expect(lit(view)).toEqual([true, true, true]);
  });
  it('highlights nothing when the panel marks playback stopped', () => {
    const view = render(<PlaybackCaption caption={{ text: 'One two three four', speaking: false }} />);
    expect(lit(view)).toEqual([false, false, false, false]);
  });
});
