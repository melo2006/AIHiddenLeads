import { describe, expect, it } from 'vitest';
import { PlaybackCaptions } from '@/lib/playbackCaptions';
describe('audible playback captions', () => {
  it('holds captions until held face audio actually starts', () => {
    const c = new PlaybackCaptions(); c.text('Hello there'); c.complete(); c.audio(12, 14);
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