import { useEffect, useState } from "react";

// Hardcoded English, consistent with the hero headline (EN-only today).
export const HERO_ROTATING_LINES = [
  "85% of callers who hit voicemail never call back. Ever.",
  "78% of customers abandoned a business after just one unanswered call.",
  "67% hang up when they can't reach a real person.",
  "Create your own streaming avatar — your face, your voice, live on your website.",
] as const;

const ROTATE_MS = 4000;
const FADE_MS = 300;

/**
 * Slim line under the hero subhead that fades through the stat hooks and the
 * streaming-avatar differentiator. The container height is fixed (room for
 * two wrapped lines) so cycling never shifts the layout. With
 * prefers-reduced-motion the first line renders statically.
 */
const HeroRotatingBullet = () => {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (reducedMotion) return;
    let interval: number | undefined;
    let fadeTimeout: number | undefined;
    const stop = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
      if (fadeTimeout !== undefined) {
        window.clearTimeout(fadeTimeout);
        fadeTimeout = undefined;
      }
    };
    const cycle = () => {
      setVisible(false);
      fadeTimeout = window.setTimeout(() => {
        setIndex(current => (current + 1) % HERO_ROTATING_LINES.length);
        setVisible(true);
      }, FADE_MS);
    };
    const start = () => {
      stop();
      interval = window.setInterval(cycle, ROTATE_MS);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
        setVisible(true);
      } else {
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reducedMotion]);

  return (
    <div className="min-h-[2.5rem] sm:min-h-[3rem]">
      <p
        className={`flex items-start gap-2 text-sm font-medium text-foreground transition-opacity duration-300 sm:text-base ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <span
          className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          aria-hidden="true"
        />
        <span>{HERO_ROTATING_LINES[reducedMotion ? 0 : index]}</span>
      </p>
    </div>
  );
};

export default HeroRotatingBullet;
