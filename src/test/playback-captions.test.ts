import { describe, expect, it } from 'vitest';
import { CAPTION_HIGHLIGHT_WORDS, PlaybackCaptions } from '@/lib/playbackCaptions';
describe('audible playback captions', () => {
  it('does not rewind the active word when streamed audio extends the response', () => {
    const c = new PlaybackCaptions(); c.text('One two three four'); c.audio(0, 4);
    expect(c.at(2.5)?.word).toBe(2);
    expect(c.at(2.5)?.highlightEnd).toBe(4);
    c.audio(4, 8);
    expect(c.at(2.6)?.word).toBe(2);
    expect(c.at(2.6)?.highlightEnd).toBe(4);
  });
  it('highlights a window of the current word and the next one', () => {
    const c = new PlaybackCaptions(); c.text('One two three four five'); c.audio(0, 5);
    expect(CAPTION_HIGHLIGHT_WORDS).toBe(2);
    expect(c.at(0.5)).toMatchObject({ word: 0, highlightEnd: 2 });
    expect(c.at(2.5)).toMatchObject({ word: 2, highlightEnd: 4 });
  });
  it('narrows the window to the last word alone at the end of a run', () => {
    const c = new PlaybackCaptions(); c.text('One two three four five'); c.audio(0, 5);
    expect(c.at(4.9)).toMatchObject({ word: 4, highlightEnd: 5 });
  });
  it('keeps the window inside its own run when a later segment exists', () => {
    const c = new PlaybackCaptions(); c.text('First response'); c.audio(1, 3); c.complete();
    c.text('Next response'); c.audio(3, 5); c.complete();
    expect(c.at(2.9)).toMatchObject({ text: 'First response', word: 1, highlightEnd: 2 });
  });
  it('holds captions until held face audio actually starts', () => {
    const c = new PlaybackCaptions(); const run = c.reserve(); c.text('Hello there'); c.complete(); c.audio(12, 14, run);
    expect(c.at(10)).toBeNull(); expect(c.at(12)?.word).toBe(0); expect(c.at(13)?.word).toBe(1);
    expect(c.at(14)).toBeNull();
  });
  it('keeps the audible turn when a later transcript arrives ahead of playback', () => {
    const c = new PlaybackCaptions(); c.text('First response'); c.audio(1, 3); c.complete();
    c.text('Next response'); c.audio(3, 5); c.complete();
    expect(c.at(2)?.text).toBe('First response'); expect(c.at(4)?.text).toBe('Next response');
  });
  it('freezes on a paused audio clock and clears on interruption', () => {
    const c = new PlaybackCaptions(); c.audio(0, 4); c.text('One two three four');
    expect(c.at(1)?.word).toBe(1); expect(c.at(1)?.word).toBe(1); c.clear(); expect(c.at(1)).toBeNull();
  });
});