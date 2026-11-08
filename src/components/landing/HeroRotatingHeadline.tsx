import { useEffect, useState } from "react";

export interface HeadlineSegment {
  text: string;
  accent?: boolean;
}

// The hero headline itself rotates through these five lines, in order.
// Hardcoded English, consistent with the rest of the hero (EN-only today;
// PT/ES translations are a follow-up).
export const HERO_HEADLINE_LINES: ReadonlyArray<ReadonlyArray<HeadlineSegment>> = [
  [
    { text: "85% of callers who hit " },
    { text: "voicemail", accent: true },
    { text: " don't call back — most move on to the next name on the list." },
  ],
  [
    { text: "Choose from dozens of live " },
    { text: "spokespersons", accent: true },
    { text: " — or put your own face on your website." },
  ],
  [{ text: "78% of customers abandoned a business after just one unanswered call." }],
  [{ text: "Never miss another call. Aspen answers in seconds — 24/7." }],
  [
    { text: "Start with voice + chat + 50 B2B prospects/month for " },
    { text: "$99/mo", accent: true },
    { text: "." },
  ],
];

export const HERO_HEADLINE_TEXTS: readonly string[] = HERO_HEADLINE_LINES.map((segments) =>
  segments.map((segment) => segment.text).join(""),
);

const DWELL_MS = 4500;

interface HeroRotatingHeadlineProps {
  /** Pause cycling (e.g. while the visitor hovers the headline or uses the hero CTAs). */
  paused?: boolean;
}

/**
 * Rotating hero headline. All five lines render stacked in a single grid
 * cell inside the page's h1, so the block always reserves exactly the
 * height of the longest-wrapping line at the current breakpoint and
 * cycling never shifts the layout below it. Lines crossfade with a slight
 * rise (~600ms) instead of jump-cutting. Inactive lines are aria-hidden
 * (no aria-live); with prefers-reduced-motion the first line is static.
 */
const HeroRotatingHeadline = ({ paused = false }: HeroRotatingHeadlineProps) => {
  const [index, setIndex] = useState(0);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (reducedMotion || paused) return;
    let interval: number | undefined;
    const stop = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };
    const start = () => {
      stop();
      interval = window.setInterval(() => {
        setIndex((current) => (current + 1) % HERO_HEADLINE_LINES.length);
      }, DWELL_MS);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
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
  }, [reducedMotion, paused]);

  const activeIndex = reducedMotion ? 0 : index;

  return (
    <span className="grid">
      {HERO_HEADLINE_LINES.map((segments, lineIndex) => {
        const active = lineIndex === activeIndex;
        return (
          <span
            key={lineIndex}
            data-line-index={lineIndex}
            data-active={active}
            aria-hidden={!active}
            className={`col-start-1 row-start-1 transition-all duration-[600ms] ease-out ${
              active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            }`}
          >
            {segments.map((segment, segmentIndex) =>
              segment.accent ? (
                <span key={segmentIndex} className="text-primary">
                  {segment.text}
                </span>
              ) : (
                <span key={segmentIndex}>{segment.text}</span>
              ),
            )}
          </span>
        );
      })}
    </span>
  );
};

export default HeroRotatingHeadline;
