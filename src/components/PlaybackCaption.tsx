import { useEffect, useRef } from 'react';
import type { PlaybackCaption as Caption } from '@/lib/playbackCaptions';

/** A spoken-word overlay, not a replacement for the stored AI Elements transcript. */
export default function PlaybackCaption({ caption }: { caption: Caption }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const touchedUntil = useRef(0);
  useEffect(() => {
    const panel = panelRef.current, word = wordRef.current;
    if (!panel || !word || Date.now() < touchedUntil.current) return;
    panel.scrollTop = Math.max(0, word.offsetTop - panel.offsetTop - panel.clientHeight / 2);
  }, [caption.word, caption.text]);
  return <div ref={panelRef} aria-label="Live playback captions" className="relative h-12 overflow-y-auto overscroll-contain text-xs leading-5" onTouchStart={() => { touchedUntil.current = Date.now() + 3000; }} onWheel={() => { touchedUntil.current = Date.now() + 3000; }}>
    {caption.text.split(/\s+/).map((word, i) => <span key={i} ref={i === caption.word ? wordRef : undefined} className={i === caption.word ? 'rounded-sm bg-primary px-0.5 font-semibold text-primary-foreground' : 'text-foreground'}>{word} </span>)}
  </div>;
}