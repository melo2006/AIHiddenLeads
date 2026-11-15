import { useLayoutEffect, useRef } from 'react';
import type { PlaybackCaption as Caption } from '@/lib/playbackCaptions';

/** Caption line height in px (text-sm leading-6 = 24px). */
export const CAPTION_LINE_HEIGHT_PX = 24;

/**
 * Snap a caption scroll position to a whole-line boundary
 * (Publish #56 layout fix): the follow math CENTERS the active
 * word, which in a 2-line-tall box parks the view with half a
 * line shaved off at BOTH edges — the owner's "clips to ~1.5
 * lines" screenshot. The caption text starts at the box's content
 * top, so its line boundaries sit at multiples of the line
 * height; snapping the rest position to the nearest one means
 * the box only ever shows full lines. The active word's line
 * stays fully visible: centering put it mid-box, and the snap
 * moves the view by at most half a line.
 */
export function snapScrollTopToLine(requested: number, lineHeight: number = CAPTION_LINE_HEIGHT_PX): number {
  if (!Number.isFinite(requested)) return 0;
  if (lineHeight <= 0) return Math.max(0, requested);
  return Math.max(0, Math.round(requested / lineHeight) * lineHeight);
}

/** A spoken-word overlay, not a replacement for the stored AI Elements transcript. */
export default function PlaybackCaption({ caption }: { caption: Caption }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const touchedUntil = useRef(0);
  useLayoutEffect(() => {
    const followWord = () => {
      const panel = panelRef.current, word = wordRef.current;
      if (!panel || !word) return;
      const bounds = panel.getBoundingClientRect();
      const active = word.getBoundingClientRect();
      // Both rectangles use viewport coordinates, independent of positioned ancestors and portals.
      panel.scrollTop = snapScrollTopToLine(Math.max(0, panel.scrollTop + active.top - bounds.top - (panel.clientHeight - active.height) / 2));
    };
    const delay = Math.max(0, touchedUntil.current - Date.now());
    if (!delay) { followWord(); return; }
    const timer = window.setTimeout(followWord, delay);
    return () => window.clearTimeout(timer);
  }, [caption.word, caption.text]);
  return <div ref={panelRef} aria-label="Live playback captions" className="relative h-full min-h-0 flex-1 overflow-y-auto overscroll-contain text-sm font-bold leading-6" onTouchStart={() => { touchedUntil.current = Date.now() + 3000; }} onWheel={() => { touchedUntil.current = Date.now() + 3000; }}>
    {caption.text.split(/\s+/).map((word, i) => {
      // The highlight is a window, not one word (CAPTION_HIGHLIGHT_WORDS in
      // playbackCaptions): `word` is its first word, `highlightEnd` its
      // exclusive end. word -1 is the panel's stopped state = no highlight.
      // Scroll-following still anchors on the window's first word.
      const highlighted = caption.word >= 0 && i >= caption.word && i < caption.highlightEnd;
      return <span key={i} ref={i === caption.word ? wordRef : undefined} className={highlighted ? 'rounded-sm bg-primary px-0.5 font-extrabold text-primary-foreground ring-1 ring-primary' : 'text-foreground'}>{word} </span>;
    })}
  </div>;
}