import { useLayoutEffect, useRef } from 'react';
import type { PlaybackCaption as Caption } from '@/lib/playbackCaptions';

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
      panel.scrollTop = Math.max(0, panel.scrollTop + active.top - bounds.top - (panel.clientHeight - active.height) / 2);
    };
    const delay = Math.max(0, touchedUntil.current - Date.now());
    if (!delay) { followWord(); return; }
    const timer = window.setTimeout(followWord, delay);
    return () => window.clearTimeout(timer);
  }, [caption.word, caption.text]);
  return <div ref={panelRef} aria-label="Live playback captions" className="relative h-[58px] overflow-y-auto overscroll-contain text-sm font-bold leading-6" onTouchStart={() => { touchedUntil.current = Date.now() + 3000; }} onWheel={() => { touchedUntil.current = Date.now() + 3000; }}>
    {caption.text.split(/\s+/).map((word, i) => <span key={i} ref={i === caption.word ? wordRef : undefined} className={i === caption.word ? 'rounded-sm bg-primary px-0.5 font-extrabold text-primary-foreground ring-1 ring-primary' : 'text-foreground'}>{word} </span>)}
  </div>;
}