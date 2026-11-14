import { displayNumbers } from './displayNumbers';

/** Playback-clock captions. Live provides text, not word timestamps. */
/**
 * The highlight covers the WHOLE segment currently being spoken, as one
 * block. Word positions would only be ESTIMATES (Live sends text, not
 * per-word timestamps): the one-word and two-word windows visibly sat on the
 * wrong words in the owner's live tests (2026-11-14) — the highlight lagged
 * on the line above while the spoken words were already on the line below.
 * The segment is the unit the playback clock CAN place reliably (it starts
 * and ends with the segment's own audio), so the block advances segment by
 * segment on that same clock and is never wrong word-by-word.
 */
type CaptionRun = { text: string; start: number | null; end: number; complete: boolean; shown?: { src: string; out: string } };
/** One spoken segment: while `speaking`, the whole `text` block is highlighted; stopped panels keep the last segment with `speaking` false. */
export type PlaybackCaption = { text: string; speaking: boolean };
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
    return { text: shownText, speaking: true };
  }
}
