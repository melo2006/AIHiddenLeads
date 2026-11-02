import { displayNumbers } from './displayNumbers';

/** Playback-clock captions. Word positions are estimated: Live provides text, not word timestamps. */
type CaptionRun = { text: string; start: number | null; end: number; complete: boolean; lastWord: number; lastTime: number; shown?: { src: string; out: string } };
export type PlaybackCaption = { text: string; word: number };
export class PlaybackCaptions {
  private runs: CaptionRun[] = [];
  private current: CaptionRun | null = null;
  private run() {
    if (!this.current) {
      this.current = { text: '', start: null, end: 0, complete: false, lastWord: 0, lastTime: -1 };
      this.runs.push(this.current);
      this.runs = this.runs.slice(-8);
    }
    return this.current;
  }
  reserve() { return this.run(); }
  audio(start: number, end: number, reserved?: CaptionRun) {
    const run = reserved ?? this.run();
    run.start ??= start;
    run.end = Math.max(run.end, end);
  }
  text(delta: string) { this.run().text += delta; }
  complete() { if (this.current) this.current.complete = true; this.current = null; }
  clear() { this.runs = []; this.current = null; }
  /** Display text for a run: spelled-out numbers become digits (display-only; run.text is untouched). */
  private displayText(run: CaptionRun): string {
    if (run.shown?.src === run.text) return run.shown.out;
    const out = displayNumbers(run.text);
    run.shown = { src: run.text, out };
    return out;
  }
  at(time: number): PlaybackCaption | null {
    const run = this.runs.find(r => r.start !== null && time >= r.start && (time < r.end || !r.complete));
    if (!run || run.start === null || !run.text.trim() || time >= run.end) return null;
    const shownText = this.displayText(run).trim();
    if (!shownText) return null;
    const words = shownText.split(/\s+/);
    // Longer words and punctuation take longer; this is an estimate, never provider alignment.
    const weights = words.map(w => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length) + (/[,.!?;:]$/.test(w) ? 2 : 0));
    let target = Math.max(0, (time - run.start) / Math.max(.01, run.end - run.start)) * weights.reduce((a, b) => a + b, 0);
    let word = 0;
    while (word < weights.length - 1 && target >= weights[word]) { target -= weights[word]; word++; }
    // Streaming audio extends the end time; never rewind a highlighted word as that happens.
    if (time >= run.lastTime) word = Math.max(word, run.lastWord);
    run.lastTime = time;
    run.lastWord = word;
    return { text: shownText, word };
  }
}