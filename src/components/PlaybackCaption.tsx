import { useLayoutEffect, useRef } from 'react';
import type { PlaybackCaption as Caption } from '@/lib/playbackCaptions';

/** A spoken-segment overlay, not a replacement for the stored AI Elements transcript. */
export default function PlaybackCaption({ caption }: { caption: Caption }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLSpanElement>(null);
  const touchedUntil = useRef(0);
  useLayoutEffect(() => {
    const followSegment = () => {
      const panel = panelRef.current, segment = segmentRef.current;
      if (!panel || !segment) return;
      const bounds = panel.getBoundingClientRect();
      const active = segment.getBoundingClientRect();
      // Both rectangles use viewport coordinates, independent of positioned ancestors and portals.
      panel.scrollTop = Math.max(0, panel.scrollTop + active.top - bounds.top - (panel.clientHeight - active.height) / 2);
    };
    // Stopped state (speaking false): the last segment stays on screen
    // unhighlighted and the scroll does not chase it.
    if (!caption.speaking) return;
    const delay = Math.max(0, touchedUntil.current - Date.now());
    if (!delay) { followSegment(); return; }
    const timer = window.setTimeout(followSegment, delay);
    return () => window.clearTimeout(timer);
  }, [caption.speaking, caption.text]);
  return <div ref={panelRef} aria-label="Live playback captions" className="relative h-full min-h-0 flex-1 overflow-y-auto overscroll-contain text-sm font-bold leading-6" onTouchStart={() => { touchedUntil.current = Date.now() + 3000; }} onWheel={() => { touchedUntil.current = Date.now() + 3000; }}>
    {caption.text.split(/\s+/).map((word, i) => {
      // The whole segment is the highlight: while it is being spoken every
      // word carries it as one block (see playbackCaptions); the stopped
      // state (speaking false) highlights nothing. Scroll-following anchors
      // on the segment's first word.
      const highlighted = caption.speaking;
      return <span key={i} ref={i === 0 ? segmentRef : undefined} className={highlighted ? 'rounded-sm bg-primary px-0.5 font-extrabold text-primary-foreground ring-1 ring-primary' : 'text-foreground'}>{word} </span>;
    })}
  </div>;
}
