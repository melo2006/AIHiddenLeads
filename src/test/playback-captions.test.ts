import { describe, expect, it } from 'vitest';
import * as playbackCaptionsModule from '@/lib/playbackCaptions';
import { PlaybackCaptions } from '@/lib/playbackCaptions';
describe('audible playback captions', () => {
  it('has no word-window machinery left: the highlight is the whole segment', () => {
    expect('CAPTION_HIGHLIGHT_WORDS' in playbackCaptionsModule).toBe(false);
    const c = new PlaybackCaptions(); c.text('One two three four'); c.audio(0, 4);
    expect(Object.keys(c.at(1)!).sort()).toEqual(['speaking', 'text']);
  });
  it('keeps the same segment when streamed audio extends the response', () => {
    const c = new PlaybackCaptions(); c.text('One two three four'); c.audio(0, 4);
    expect(c.at(2.5)).toEqual({ text: 'One two three four', speaking: true });
    c.audio(4, 8);
    expect(c.at(2.6)).toEqual({ text: 'One two three four', speaking: true });
    expect(c.at(6)).toEqual({ text: 'One two three four', speaking: true });
  });
  it('returns the whole segment at every point inside it, not a word window', () => {
    const c = new PlaybackCaptions(); c.text('One two three four five'); c.audio(0, 5);
    expect(c.at(0.5)).toEqual({ text: 'One two three four five', speaking: true });
    expect(c.at(2.5)).toEqual({ text: 'One two three four five', speaking: true });
    expect(c.at(4.9)).toEqual({ text: 'One two three four five', speaking: true });
  });
  it('advances segment by segment on the playback clock', () => {
    const c = new PlaybackCaptions(); c.text('First response'); c.audio(1, 3); c.complete();
    c.text('Next response'); c.audio(3, 5); c.complete();
    expect(c.at(2.9)).toEqual({ text: 'First response', speaking: true });
    expect(c.at(4)).toEqual({ text: 'Next response', speaking: true });
  });
  it('holds captions until held face audio actually starts', () => {
    const c = new PlaybackCaptions(); const run = c.reserve(); c.text('Hello there'); c.complete(); c.audio(12, 14, run);
    expect(c.at(10)).toBeNull();
    expect(c.at(12)).toEqual({ text: 'Hello there', speaking: true });
    expect(c.at(13)).toEqual({ text: 'Hello there', speaking: true });
    expect(c.at(14)).toBeNull();
  });
  it('keeps the audible turn when a later transcript arrives ahead of playback', () => {
    const c = new PlaybackCaptions(); c.text('First response'); c.audio(1, 3); c.complete();
    c.text('Next response'); c.audio(3, 5); c.complete();
    expect(c.at(2)?.text).toBe('First response'); expect(c.at(4)?.text).toBe('Next response');
  });
  it('freezes on a paused audio clock and clears on interruption', () => {
    const c = new PlaybackCaptions(); c.audio(0, 4); c.text('One two three four');
    expect(c.at(1)).toEqual({ text: 'One two three four', speaking: true });
    expect(c.at(1)).toEqual({ text: 'One two three four', speaking: true });
    c.clear(); expect(c.at(1)).toBeNull();
  });
});
