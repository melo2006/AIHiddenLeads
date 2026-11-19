import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2 } from "lucide-react";

/**
 * Homepage intro video — the founder film (three customers who couldn't get
 * a callback, the happy payoff case, Aspen explaining the fix, Ron Melo
 * introducing himself). Current cut: the 2026-11-19 remake.
 *
 * Owner's playback spec (2026-11-18):
 * - When the block scrolls into view it plays automatically, muted
 *   (browsers require muted autoplay), and loops 3 times, then stops.
 * - Captions are ON from the start (English WebVTT track).
 * - A clear speaker button unmutes and restarts the film WITH sound and
 *   full native controls (play/pause, seek, fullscreen).
 * - Any click on the video also switches to full native controls.
 * - prefers-reduced-motion: no autoplay — poster + play button instead.
 * - Pauses when scrolled out of view.
 *
 * The film itself is a single swappable asset: replace
 * public/video/aspen-intro.mp4 (+ poster / .en.vtt) to swap the video.
 */
const MAX_PLAYS = 3;

const AspenIntroVideo = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playsRef = useRef(0);
  const interactedRef = useRef(false);
  const finishedRef = useRef(false);
  const [finished, setFinished] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [interacted, setInteracted] = useState(false);

  // Captions on by default.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const enableCaptions = () => {
      const track = v.textTracks[0];
      if (track) track.mode = "showing";
    };
    enableCaptions();
    v.addEventListener("loadedmetadata", enableCaptions);
    return () => v.removeEventListener("loadedmetadata", enableCaptions);
  }, []);

  // Loop counting for the muted autoplay run: after MAX_PLAYS full plays,
  // stop and offer a replay button. Once the visitor takes over (native
  // controls), the counter no longer applies.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => {
      if (interactedRef.current) return;
      playsRef.current += 1;
      if (playsRef.current < MAX_PLAYS) {
        v.currentTime = 0;
        void v.play().catch(() => {});
      } else {
        finishedRef.current = true;
        setFinished(true);
      }
    };
    v.addEventListener("ended", onEnded);
    return () => v.removeEventListener("ended", onEnded);
  }, []);

  // Start/pause the muted autoplay with visibility.
  useEffect(() => {
    const v = videoRef.current;
    const el = wrapRef.current;
    if (!v || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNeedsTap(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (interactedRef.current || finishedRef.current) return;
          if (entry.intersectionRatio >= 0.5) {
            if (v.paused) {
              v.muted = true;
              void v.play().catch(() => setNeedsTap(true));
            }
          } else if (!v.paused) {
            v.pause();
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const startWithSound = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    interactedRef.current = true;
    setInteracted(true);
    setFinished(false);
    finishedRef.current = false;
    setNeedsTap(false);
    v.muted = false;
    v.controls = true;
    v.currentTime = 0;
    void v.play().catch(() => {});
  }, []);

  const handleVideoClick = useCallback(() => {
    const v = videoRef.current;
    if (!v || interactedRef.current) return;
    interactedRef.current = true;
    setInteracted(true);
    v.controls = true;
    if (v.paused) void v.play().catch(() => {});
  }, []);

  const handleReplay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    playsRef.current = 0;
    finishedRef.current = false;
    setFinished(false);
    v.muted = true;
    v.currentTime = 0;
    void v.play().catch(() => {});
  }, []);

  return (
    <div
      ref={wrapRef}
      data-testid="aspen-intro-video"
      className="relative w-full min-w-0 flex-1 overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-primary/40"
    >
      <video
        ref={videoRef}
        className="block aspect-video h-full w-full"
        src="/video/aspen-intro.mp4"
        poster="/video/aspen-intro-poster.jpg"
        preload="metadata"
        playsInline
        muted
        onClick={handleVideoClick}
      >
        <track
          kind="captions"
          src="/video/aspen-intro.en.vtt"
          srcLang="en"
          label="English"
          default
        />
      </video>

      {!interacted && !finished && !needsTap && (
        <button
          type="button"
          aria-label="Play video with sound"
          onClick={startWithSound}
          className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/60 px-3.5 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
          Sound on
        </button>
      )}

      {needsTap && !interacted && (
        <button
          type="button"
          aria-label="Play video"
          onClick={startWithSound}
          className="absolute inset-0 flex items-center justify-center bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
            <Play className="ml-1 h-7 w-7" aria-hidden="true" />
          </span>
        </button>
      )}

      {finished && !interacted && (
        <button
          type="button"
          aria-label="Replay video"
          onClick={handleReplay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-xl">
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
            Replay
          </span>
        </button>
      )}
    </div>
  );
};

export default AspenIntroVideo;
