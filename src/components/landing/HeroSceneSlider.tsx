import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import HeroRotatingHeadline, {
  HERO_HEADLINE_LINES,
  HERO_SLIDE_DWELL_MS,
  type HeadlineSegment,
  type HeroTextPlacement,
  type HeroTextSide,
} from "@/components/landing/HeroRotatingHeadline";
import plumberPain from "@/assets/hero-scenes/hero-plumber-pain.webp";
import plumberPainSm from "@/assets/hero-scenes/hero-plumber-pain-sm.webp";
import acGuyPain from "@/assets/hero-scenes/hero-ac-guy-pain.webp";
import acGuyPainSm from "@/assets/hero-scenes/hero-ac-guy-pain-sm.webp";
import rooferPain from "@/assets/hero-scenes/hero-roofer-pain.webp";
import rooferPainSm from "@/assets/hero-scenes/hero-roofer-pain-sm.webp";
import manufacturerPainWhitehair from "@/assets/hero-scenes/hero-manufacturer-pain-whitehair.webp";
import manufacturerPainWhitehairSm from "@/assets/hero-scenes/hero-manufacturer-pain-whitehair-sm.webp";
import facesMontage from "@/assets/hero-scenes/hero-faces-montage.webp";
import facesMontageSm from "@/assets/hero-scenes/hero-faces-montage-sm.webp";
import coupleRelief from "@/assets/hero-scenes/hero-couple-relief.webp";
import coupleReliefSm from "@/assets/hero-scenes/hero-couple-relief-sm.webp";
import aspenOwners from "@/assets/hero-scenes/hero-aspen-owners.webp";
import aspenOwnersSm from "@/assets/hero-scenes/hero-aspen-owners-sm.webp";

interface HeroScene {
  id: string;
  /** 1920w WebP for desktop widths. */
  src: string;
  /** 960w WebP for narrow widths. */
  srcSm: string;
  alt: string;
  /**
   * object-position, tuned for the slider band: on desktop the crop cuts
   * top/bottom (y bias keeps each face, all in the upper half, in frame)
   * and on phone it cuts the sides (x bias keeps the subject — composed
   * on the side opposite the slogan — in frame).
   */
  position: string;
  /**
   * Slogan placement override for this scene (default "side": the
   * alternating side zone). "bottom" moves the slogan into the shaded
   * bottom band at every breakpoint — for photos whose subjects span
   * the whole frame (the spokesperson team photo), where any side zone
   * would cover faces. Encoded per scene so the text moves where the
   * faces aren't; every other slide keeps the standard placement.
   */
  placement?: HeroTextPlacement;
}

// The seven scenes (2026-11-18, owner-approved lineup, SLIDER PACKAGE
// v2; v3 polish: the older couple is mirrored so they stand clear of
// their right-side slogan; the speech bubbles the AC man and the
// white-haired owner carried in v3/v4 were removed 2026-11-19 on the
// owner's final call — the photos run clean): the four
// pain lines show the missed-call moment — owners caught
// mid-job while the phone rings unanswered — and the three promise
// lines show the same world calm, the phones handled, closing on Aspen
// herself showing two owners the leads she caught. Candid,
// photorealistic, one campaign grade; signage carries no names or
// logos. Casting per the owner: one Black owner (the plumber), one
// Latino owner (the roofer), the rest white — including two
// white-haired owners (the AC man, the machine-shop owner), the
// eight-face spokesperson team photo (Aspen and Frank in front, with
// Alex, Monica, Denise, Andy, Diego and James behind them — it
// replaced the husky workshop couple on 2026-11-19, whose assets stay
// in the repo unreferenced), and an older couple. Person side
// alternates against the slogan side: even slides person RIGHT / text
// LEFT, odd slides person LEFT / text RIGHT (the person-left photos are
// mirrored versions of the approved generations — no readable text in
// any of them, so nothing reads backwards).
const HERO_SCENES: readonly HeroScene[] = [
  { id: "plumber-pain", src: plumberPain, srcSm: plumberPainSm, position: "72% 25%", alt: "A plumber under a kitchen sink, glancing at her phone ringing on the counter" },
  { id: "ac-guy-pain", src: acGuyPain, srcSm: acGuyPainSm, position: "30% 5%", alt: "An air-conditioning repairman fanning himself in a hot workshop while his desk phone rings unanswered" },
  { id: "roofer-pain", src: rooferPain, srcSm: rooferPainSm, position: "62% 12%", alt: "A roofer up on a roof, nail gun in hand, his phone buzzing in his tool belt" },
  { id: "manufacturer-pain-whitehair", src: manufacturerPainWhitehair, srcSm: manufacturerPainWhitehairSm, position: "30% 10%", alt: "A white-haired machine-shop owner staring at his phone in disbelief at six missed calls, buried in paper orders" },
  { id: "faces-montage", src: facesMontage, srcSm: facesMontageSm, position: "55% 33%", placement: "bottom", alt: "The AiHiddenLeads spokesperson team — eight live video avatars led by Aspen and Frank, smiling together in a bright office lounge" },
  { id: "couple-relief", src: coupleRelief, srcSm: coupleReliefSm, position: "30% 22%", alt: "An older couple who own a small shop, laughing as they hand a bag to a customer" },
  { id: "aspen-owners", src: aspenOwners, srcSm: aspenOwnersSm, position: "78% 32%", alt: "Aspen showing two kitchen and marble shop owners their answered calls and new leads on a tablet" },
];

/**
 * Headline index -> scene index. Every locale's heroHeadlines carry the
 * same seven lines in the same order (homepageSalesCopy), so one map
 * serves all languages. The emotion follows the line:
 *   0 voicemail / don't call back      -> plumber-pain (under the sink, phone lit on the counter)
 *   1 hang up, can't reach a person    -> ac-guy-pain (shirt open in the heat, fanning himself, desk phone ringing)
 *   2 78% abandoned, one missed call   -> roofer-pain (up on the roof, phone buzzing in his belt)
 *   3 owners shocked, ONE missed call  -> manufacturer-pain-whitehair (staring at his phone — six missed calls — the disbelief beat; the master is pre-mirrored)
 *   4 spokespersons / your own face    -> faces-montage (the eight spokesperson models as one team photo; faces span the whole frame, so this scene declares placement "bottom" — the slogan moves into the bottom band where only torsos are, keeping every face visible)
 *   5 never miss another call, 24/7    -> couple-relief (the older couple, free to laugh with the customer in front of them; the master is mirrored so the couple stands left, clear of this line's right-side slogan)
 *   6 $99/mo + B2B prospects           -> aspen-owners (Aspen showing the cabinet-shop owners their leads on her tablet — the payoff)
 */
const SCENE_FOR_LINE: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export const HERO_LINE_COUNT = SCENE_FOR_LINE.length;

export const sceneIndexForLine = (lineIndex: number): number =>
  SCENE_FOR_LINE[lineIndex] ?? lineIndex % HERO_SCENES.length;

/** Slogan side per slide: even lines read left, odd lines read right. */
export const textSideForLine = (lineIndex: number): HeroTextSide =>
  lineIndex % 2 === 0 ? "left" : "right";

/** Slogan placement per slide, from the scene the line shows. */
export const placementForLine = (lineIndex: number): HeroTextPlacement =>
  HERO_SCENES[sceneIndexForLine(lineIndex)].placement ?? "side";

/** Horizontal swipe distance (px) that counts as a slide change. */
const HERO_SWIPE_MIN_PX = 40;

interface HeroSceneSliderProps {
  /** The hero headline lines, in the visitor's language. */
  lines?: ReadonlyArray<ReadonlyArray<HeadlineSegment>>;
}

/**
 * Homepage hero slider — the same format as the /agents/realtors hero
 * slideshow (owner direction, 2026-11-18): a photo band with the slogan
 * overlaid on the picture, prev/next chevron buttons, dot indicators, a
 * pause/play toggle, and touch swipe. Photo + slogan crossfade together
 * as pairs every ~10s. Taking manual control (dot, arrow, swipe) pauses
 * auto-rotation until play is pressed; hovering or focusing the band
 * pauses it only while the pointer/focus stays. A visitor who prefers
 * reduced motion gets slide 1, static — no rotation — with every
 * control still usable.
 *
 * Visibility first (the owner's core complaint, twice): the photo is
 * never darkened as a whole. The only treatment is a LIGHT shade behind
 * the slogan's text zone — a side gradient on sm+ (the person's side of
 * the frame stays clear), a bottom strip on phones — under bright white
 * text. The one exception is the team-photo slide, whose scene declares
 * placement "bottom": its shade and slogan use the bottom band at every
 * size, because its eight faces span both sides of the frame. The slogan is the page's single h1 (HeroRotatingHeadline).
 * Only the active scene and the next one are mounted at first, so first
 * paint loads a single scene and the rest stream in one dwell ahead of
 * their turn; a dot-jump mounts its scene on demand.
 */
const HeroSceneSlider = ({ lines = HERO_HEADLINE_LINES }: HeroSceneSliderProps) => {
  // Read once at mount, like the old rotating headline did (framer's
  // useReducedMotion latches globally, which made the setting stale
  // across mounts); the behavior matches the realtor slideshow: static
  // first slide, controls still usable.
  const [reduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [active, setActive] = useState(0);
  // Transient pause while the pointer hovers or focus is inside.
  const [hoverPaused, setHoverPaused] = useState(false);
  // Sticky pause: the pause/play toggle, or any manual navigation.
  const [userPaused, setUserPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const [mountedScenes, setMountedScenes] = useState<ReadonlySet<number>>(
    () => new Set([sceneIndexForLine(0), sceneIndexForLine(1)]),
  );

  const slideCount = lines.length;

  const goTo = (index: number) => {
    setActive(((index % slideCount) + slideCount) % slideCount);
    setUserPaused(true);
  };
  const goPrev = () => goTo(active - 1);
  const goNext = () => goTo(active + 1);

  useEffect(() => {
    if (reduceMotion || hoverPaused || userPaused || slideCount < 2) return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % slideCount);
    }, HERO_SLIDE_DWELL_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion, hoverPaused, userPaused, slideCount]);

  useEffect(() => {
    const activeScene = sceneIndexForLine(active);
    const nextScene = sceneIndexForLine((active + 1) % HERO_LINE_COUNT);
    setMountedScenes((current) => {
      if (current.has(activeScene) && current.has(nextScene)) return current;
      const next = new Set(current);
      next.add(activeScene);
      next.add(nextScene);
      return next;
    });
  }, [active]);

  const controlButtonClass =
    "flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

  const activeScene = sceneIndexForLine(active);

  return (
    <div
      data-home-hero-slider
      role="region"
      aria-roledescription="carousel"
      aria-label="Why owners miss calls — and how Aspen answers them"
      className="relative h-[300px] overflow-hidden rounded-[1.5rem] border border-primary/25 shadow-2xl shadow-primary/10 sm:h-[380px] sm:rounded-[2rem] lg:h-[500px]"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
      onPointerDown={() => setHoverPaused(true)}
      onPointerUp={() => setHoverPaused(false)}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = touchStartX.current;
        touchStartX.current = null;
        if (startX === null) return;
        const endX = event.changedTouches[0]?.clientX;
        if (endX === undefined) return;
        const deltaX = endX - startX;
        if (Math.abs(deltaX) < HERO_SWIPE_MIN_PX) return;
        if (deltaX < 0) goNext();
        else goPrev();
      }}
    >
      {HERO_SCENES.map((scene, sceneIndex) => {
        if (!mountedScenes.has(sceneIndex)) return null;
        const isActive = sceneIndex === activeScene;
        const isFirstScene = sceneIndex === sceneIndexForLine(0);
        const side = textSideForLine(sceneIndex);
        const placement = scene.placement ?? "side";
        return (
          <div
            key={scene.id}
            data-hero-slide={scene.id}
            data-active={isActive}
            aria-hidden={!isActive}
            className={`absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none ${
              isActive ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <img
              src={scene.src}
              srcSet={`${scene.srcSm} 960w, ${scene.src} 1920w`}
              sizes="100vw"
              alt={isActive ? scene.alt : ""}
              draggable={false}
              loading={isFirstScene ? "eager" : "lazy"}
              fetchPriority={isFirstScene ? "high" : "low"}
              style={{ objectPosition: scene.position }}
              className="h-full w-full object-cover"
            />
            {placement === "bottom" ? (
              /* Bottom-placement scene (the team photo): one bottom
                 shade at every size — the slogan band sits there and
                 every face stays clear above it. */
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[76%] bg-gradient-to-t from-black/70 via-black/30 to-transparent"
              />
            ) : (
              <>
                {/* Phone: a soft shade along the bottom only — the slogan
                    strip sits there and the face stays clear up top. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[78%] bg-gradient-to-t from-black/70 via-black/30 to-transparent sm:hidden"
                />
                {/* sm+: a light shade behind the slogan's side only; the
                    person's side of the photo is never darkened. */}
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 hidden w-[64%] to-transparent sm:block ${
                    side === "left"
                      ? "left-0 bg-gradient-to-r from-black/60 via-black/25"
                      : "right-0 bg-gradient-to-l from-black/60 via-black/25"
                  }`}
                />
              </>
            )}
          </div>
        );
      })}

      {/* The slogan — the page's single h1 — overlaid on the active
          slide, bright white over the light shade, face always clear. */}
      <h1 className="pointer-events-none absolute inset-0 z-10 text-[1.22rem] font-bold leading-[1.15] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-3xl lg:text-[2.6rem] lg:leading-[1.12]">
        <HeroRotatingHeadline
          activeIndex={active}
          lines={lines}
          textSideForLine={textSideForLine}
          placementForLine={placementForLine}
        />
      </h1>

      <button
        type="button"
        onClick={goPrev}
        aria-label="Previous slide"
        className={`${controlButtonClass} absolute left-3 top-1/2 z-20 -translate-y-1/2`}
      >
        <ChevronLeft className="h-6 w-6" aria-hidden />
      </button>
      <button
        type="button"
        onClick={goNext}
        aria-label="Next slide"
        className={`${controlButtonClass} absolute right-3 top-1/2 z-20 -translate-y-1/2`}
      >
        <ChevronRight className="h-6 w-6" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setUserPaused((value) => !value)}
        aria-label={userPaused ? "Play slideshow" : "Pause slideshow"}
        aria-pressed={userPaused}
        className={`${controlButtonClass} absolute right-4 top-4 z-20`}
      >
        {userPaused ? (
          <Play className="h-5 w-5" aria-hidden />
        ) : (
          <Pause className="h-5 w-5" aria-hidden />
        )}
      </button>
      <div className="absolute bottom-4 right-5 z-20 flex gap-2 sm:right-8">
        {lines.map((segments, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show slide ${i + 1}: ${segments.map((segment) => segment.text).join("")}`}
            aria-current={i === active}
            className={`h-2.5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              i === active
                ? "w-7 bg-primary"
                : "w-2.5 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroSceneSlider;
