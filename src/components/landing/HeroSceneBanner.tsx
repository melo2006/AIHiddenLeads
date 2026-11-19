import { useEffect, useState } from "react";
import plumberPain from "@/assets/hero-scenes/hero-plumber-pain.webp";
import plumberPainSm from "@/assets/hero-scenes/hero-plumber-pain-sm.webp";
import dentistPain from "@/assets/hero-scenes/hero-dentist-pain.webp";
import dentistPainSm from "@/assets/hero-scenes/hero-dentist-pain-sm.webp";
import rooferPain from "@/assets/hero-scenes/hero-roofer-pain.webp";
import rooferPainSm from "@/assets/hero-scenes/hero-roofer-pain-sm.webp";
import manufacturerPain from "@/assets/hero-scenes/hero-manufacturer-pain.webp";
import manufacturerPainSm from "@/assets/hero-scenes/hero-manufacturer-pain-sm.webp";
import shopRelief from "@/assets/hero-scenes/hero-shop-relief.webp";
import shopReliefSm from "@/assets/hero-scenes/hero-shop-relief-sm.webp";
import firmRelief from "@/assets/hero-scenes/hero-firm-relief.webp";
import firmReliefSm from "@/assets/hero-scenes/hero-firm-relief-sm.webp";
import manufacturerRelief from "@/assets/hero-scenes/hero-manufacturer-relief.webp";
import manufacturerReliefSm from "@/assets/hero-scenes/hero-manufacturer-relief-sm.webp";

interface HeroScene {
  id: string;
  /** 1920w WebP for desktop widths. */
  src: string;
  /** 960w WebP for narrow widths. */
  srcSm: string;
  /**
   * object-position, tuned for the banner band (2026-11-18): the band is
   * short and wide, so on desktop the crop cuts top/bottom (y bias keeps
   * each face, all in the upper half, in frame) and on phone it cuts the
   * sides (x bias keeps each right-of-frame subject in frame).
   */
  position: string;
}

// The seven scenes (2026-11-18, owner-directed pain -> relief arc): the
// four pain lines show the missed-call moment — owners caught mid-job
// while the phone rings unanswered — and the three promise lines show
// the same world calm, the phones handled. Candid, photorealistic, one
// campaign grade; signage carries no names or logos. Exactly one scene
// (manufacturer-pain) uses the head-in-hand stress beat, on the line
// addressed to owners themselves.
const HERO_SCENES: readonly HeroScene[] = [
  { id: "plumber-pain", src: plumberPain, srcSm: plumberPainSm, position: "72% 25%" },
  { id: "dentist-pain", src: dentistPain, srcSm: dentistPainSm, position: "74% 20%" },
  { id: "roofer-pain", src: rooferPain, srcSm: rooferPainSm, position: "62% 12%" },
  { id: "manufacturer-pain", src: manufacturerPain, srcSm: manufacturerPainSm, position: "72% 22%" },
  { id: "shop-relief", src: shopRelief, srcSm: shopReliefSm, position: "70% 25%" },
  { id: "firm-relief", src: firmRelief, srcSm: firmReliefSm, position: "76% 20%" },
  { id: "manufacturer-relief", src: manufacturerRelief, srcSm: manufacturerReliefSm, position: "73% 15%" },
];

/**
 * Headline index -> scene index. Every locale's heroHeadlines carry the
 * same seven lines in the same order (homepageSalesCopy), so one map
 * serves all languages. The emotion follows the line:
 *   0 voicemail / don't call back      -> plumber-pain (under the sink, phone lit on the counter)
 *   1 hang up, can't reach a person    -> dentist-pain (chairside, desk phone ringing)
 *   2 78% abandoned, one missed call   -> roofer-pain (up on the roof, phone buzzing in his belt)
 *   3 owners shocked, ONE missed call  -> manufacturer-pain (the one head-in-hand beat)
 *   4 spokespersons / your own face    -> shop-relief (the owners ARE the face, laughing with a customer)
 *   5 never miss another call, 24/7    -> firm-relief (calm at her desk, calls handled)
 *   6 $99/mo + B2B prospects           -> manufacturer-relief (walking the floor, business humming)
 */
const SCENE_FOR_LINE: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export const HERO_LINE_COUNT = SCENE_FOR_LINE.length;

export const sceneIndexForLine = (lineIndex: number): number =>
  SCENE_FOR_LINE[lineIndex] ?? lineIndex % HERO_SCENES.length;

interface HeroSceneBannerProps {
  /** The hero headline's active line index (HeroRotatingHeadline). */
  activeLineIndex: number;
}

/**
 * Photo banner band at the top of the hero, crossfading in sync with the
 * rotating headline (owner direction, 2026-11-18: a banner — shorter
 * than the old full-hero backdrop — so the person in each scene reads
 * clearly; all hero text sits below it on the solid section background).
 * The photo carries NO darkening veil; the only treatment is a soft fade
 * at the bottom edge into the section background (background-colored in
 * both themes, so the band blends into the page). Decorative only
 * (aria-hidden); only the active scene and the next one are mounted, so
 * first paint loads a single scene and the rest stream in one dwell
 * ahead of their turn. With prefers-reduced-motion the headline never
 * leaves line 0, so the first scene simply stays put.
 */
const HeroSceneBanner = ({ activeLineIndex }: HeroSceneBannerProps) => {
  const activeScene = sceneIndexForLine(activeLineIndex);
  const [mountedScenes, setMountedScenes] = useState<ReadonlySet<number>>(
    () => new Set([sceneIndexForLine(0), sceneIndexForLine(1)]),
  );

  useEffect(() => {
    const nextScene = sceneIndexForLine((activeLineIndex + 1) % HERO_LINE_COUNT);
    setMountedScenes((current) => {
      if (current.has(activeScene) && current.has(nextScene)) return current;
      const next = new Set(current);
      next.add(activeScene);
      next.add(nextScene);
      return next;
    });
  }, [activeLineIndex, activeScene]);

  return (
    <div
      aria-hidden="true"
      className="relative h-[264px] overflow-hidden rounded-[1.5rem] shadow-xl ring-1 ring-foreground/10 sm:h-[320px] sm:rounded-[2rem] lg:h-[460px]"
    >
      {HERO_SCENES.map((scene, sceneIndex) => {
        if (!mountedScenes.has(sceneIndex)) return null;
        const active = sceneIndex === activeScene;
        const isFirstScene = sceneIndex === sceneIndexForLine(0);
        return (
          <img
            key={scene.id}
            src={scene.src}
            srcSet={`${scene.srcSm} 960w, ${scene.src} 1920w`}
            sizes="100vw"
            alt=""
            draggable={false}
            loading={isFirstScene ? "eager" : "lazy"}
            fetchPriority={isFirstScene ? "high" : "low"}
            style={{ objectPosition: scene.position }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-out motion-reduce:transition-none ${
              active ? "opacity-100" : "opacity-0"
            }`}
          />
        );
      })}
      {/* Bottom-edge blend only: the band melts into the section
          background below it. No veil over the photo itself, so the
          people stay bright and recognisable. */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/30 to-transparent sm:h-24" />
    </div>
  );
};

export default HeroSceneBanner;
