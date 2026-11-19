export interface HeadlineSegment {
  text: string;
  accent?: boolean;
}

// The hero headline rotates through these seven lines, in order. This is
// the ENGLISH set, kept as the default; HeroSection passes the localized
// set for the visitor's language (homepageSalesCopy's heroHeadlines —
// en / es / pt-BR / fr-CA) via the lines prop.
export const HERO_HEADLINE_LINES: ReadonlyArray<ReadonlyArray<HeadlineSegment>> = [
  [
    { text: "85% of " },
    { text: "voicemail", accent: true },
    { text: " callers never call back. They call your competitor." },
  ],
  [{ text: "67% of callers hang up when no real person answers." }],
  [
    { text: "78% of customers leave after " },
    { text: "ONE", accent: true },
    { text: " bad experience." },
  ],
  [{ text: "One unanswered call can cost you 78% of customers." }],
  [
    { text: "Pick a live " },
    { text: "spokesperson", accent: true },
    { text: " — or use your own face." },
  ],
  [{ text: "Never miss a call again. Aspen answers in seconds — 24/7." }],
  [
    { text: "Voice + chat + up to 50 B2B prospects a month — " },
    { text: "$99/mo.", accent: true },
  ],
];

export const HERO_HEADLINE_TEXTS: readonly string[] = HERO_HEADLINE_LINES.map((segments) =>
  segments.map((segment) => segment.text).join(""),
);

/**
 * Per-slide dwell before the hero slider crossfades to the next slide.
 * The lines run long, and each now sits over a photo the visitor should
 * have time to take in, so the owner asked for a couple more seconds
 * over the old 7.5s headline pace (2026-11-18): 10s per slide.
 */
export const HERO_SLIDE_DWELL_MS = 10_000;

/** Which side of the slide a line's text zone sits on (sm and up). */
export type HeroTextSide = "left" | "right";

interface HeroRotatingHeadlineProps {
  /** The active line index — owned by HeroSceneSlider's rotation state. */
  activeIndex: number;
  /** The lines to rotate, in the visitor's language. Defaults to the English set. */
  lines?: ReadonlyArray<ReadonlyArray<HeadlineSegment>>;
  /**
   * Text side per line index. The slider alternates sides so the slogan
   * never covers the person in the photo (even lines left, odd right).
   * Below sm the side is ignored: every line sits in the bottom strip.
   */
  textSideForLine?: (lineIndex: number) => HeroTextSide;
}

/**
 * The hero slogan layer — the page's single h1, rendered inside the
 * hero slider over the active slide's photo. All seven lines render
 * stacked in a single grid cell, so cycling never shifts layout; lines
 * crossfade with a slight rise (~600ms) in sync with the photo beneath
 * them. Each line's text zone hugs its slide's emptier side (alternating
 * left/right on sm+); on phones every line drops to a shaded strip along
 * the bottom of the slide so the person's face stays clear up top.
 * Inactive lines are aria-hidden (no aria-live). Timing, arrows, dots
 * and swipe live in HeroSceneSlider, which owns the active index.
 */
const HeroRotatingHeadline = ({
  activeIndex,
  lines = HERO_HEADLINE_LINES,
  textSideForLine,
}: HeroRotatingHeadlineProps) => (
  <span className="grid h-full">
    {lines.map((segments, lineIndex) => {
      const active = lineIndex === activeIndex;
      const side = textSideForLine?.(lineIndex) ?? "left";
      return (
        <span
          key={lineIndex}
          data-line-index={lineIndex}
          data-active={active}
          data-text-side={side}
          aria-hidden={!active}
          className={`col-start-1 row-start-1 flex items-end px-14 pb-12 transition-all duration-[600ms] ease-out motion-reduce:transition-none sm:items-center sm:px-20 sm:pb-0 ${
            active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          <span
            className={`w-full sm:w-[56%] ${
              side === "right" ? "sm:ml-auto sm:text-right" : "sm:mr-auto sm:text-left"
            }`}
          >
            {segments.map((segment, segmentIndex) =>
              segment.accent ? (
                <span key={segmentIndex} className="text-emerald-400">
                  {segment.text}
                </span>
              ) : (
                <span key={segmentIndex}>{segment.text}</span>
              ),
            )}
          </span>
        </span>
      );
    })}
  </span>
);

export default HeroRotatingHeadline;
