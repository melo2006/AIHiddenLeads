/** Playback-clock captions. Word positions are estimated: Live provides text, not word timestamps. */
type CaptionRun = { text: string; start: number | null; end: number; complete: boolean };
export type PlaybackCaption = { text: string; word: number };
export class PlaybackCaptions {
  private runs: CaptionRun[] = [];
  private current: CaptionRun | null = null;
  private run() {
    if (!this.current) {
      this.current = { text: '', start: null, end: 0, complete: false };
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
  at(time: number): PlaybackCaption | null {
    const run = this.runs.find(r => r.start !== null && time >= r.start && (time < r.end || !r.complete));
    if (!run || run.start === null || !run.text.trim() || time >= run.end) return null;
    const words = run.text.trim().split(/\s+/);
    // Longer words and punctuation take longer; this is an estimate, never provider alignment.
    const weights = words.map(w => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length) + (/[,.!?;:]$/.test(w) ? 2 : 0));
    let target = Math.max(0, (time - run.start) / Math.max(.01, run.end - run.start)) * weights.reduce((a, b) => a + b, 0);
    let word = 0;
    while (word < weights.length - 1 && target >= weights[word]) { target -= weights[word]; word++; }
    return { text: run.text.trim(), word };
  }
}