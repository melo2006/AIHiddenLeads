import { useEffect, useState } from "react";
import roofer from "@/assets/hero-scenes/hero-roofer.webp";
import rooferSm from "@/assets/hero-scenes/hero-roofer-sm.webp";
import plumber from "@/assets/hero-scenes/hero-plumber.webp";
import plumberSm from "@/assets/hero-scenes/hero-plumber-sm.webp";
import dentist from "@/assets/hero-scenes/hero-dentist.webp";
import dentistSm from "@/assets/hero-scenes/hero-dentist-sm.webp";
import manufacturer from "@/assets/hero-scenes/hero-manufacturer.webp";
import manufacturerSm from "@/assets/hero-scenes/hero-manufacturer-sm.webp";
import shop from "@/assets/hero-scenes/hero-shop.webp";
import shopSm from "@/assets/hero-scenes/hero-shop-sm.webp";
import firm from "@/assets/hero-scenes/hero-firm.webp";
import firmSm from "@/assets/hero-scenes/hero-firm-sm.webp";

interface HeroScene {
  id: string;
  /** 1920w WebP for desktop widths. */
  src: string;
  /** 960w WebP for narrow widths. */
  srcSm: string;
  /**
   * object-position: subjects sit in the right of each frame, so the x
   * bias keeps them in view when a tall phone crop cuts the sides; the y
   * bias keeps faces in view when a wide desktop crop cuts top/bottom.
   */
  position: string;
}

// The six owner-approved scenes (2026-11-18): trades and B2B owners caught
// mid-work while the phone rings — the "never miss a call" story told
// visually. Faces are happy; signage carries no names or logos.
const HERO_SCENES: readonly HeroScene[] = [
  { id: "roofer", src: roofer, srcSm: rooferSm, position: "80% 32%" },
  { id: "plumber", src: plumber, srcSm: plumberSm, position: "76% 35%" },
  { id: "dentist", src: dentist, srcSm: dentistSm, position: "63% 32%" },
  { id: "manufacturer", src: manufacturer, srcSm: manufacturerSm, position: "84% 35%" },
  { id: "shop", src: shop, srcSm: shopSm, position: "67% 32%" },
  { id: "firm", src: firm, srcSm: firmSm, position: "82% 35%" },
];

/**
 * Headline index -> scene index. Every locale's heroHeadlines carry the
 * same seven lines in the same order (homepageSalesCopy), so one map
 * serves all languages:
 *   0 voicemail / don't call back      -> plumber (mid-job, phone on the counter)
 *   1 hang up, can't reach a person    -> dentist (chairside, phone ringing)
 *   2 78% abandoned, one missed call   -> roofer (up on the roof)
 *   3 owners shocked, ONE missed call  -> manufacturer (out on the floor)
 *   4 spokespersons / your own face    -> shop (the owners ARE the face)
 *   5 never miss another call, 24/7    -> firm (the office is covered)
 *   6 $99/mo + B2B prospects           -> manufacturer (a B2B seller)
 */
const SCENE_FOR_LINE: readonly number[] = [1, 2, 0, 3, 4, 5, 3];

export const HERO_LINE_COUNT = SCENE_FOR_LINE.length;

export const sceneIndexForLine = (lineIndex: number): number =>
  SCENE_FOR_LINE[lineIndex] ?? lineIndex % HERO_SCENES.length;

interface HeroSceneBackdropProps {
  /** The hero headline's active line index (HeroRotatingHeadline). */
  activeLineIndex: number;
}

/**
 * Full-bleed photo backdrop for the hero, crossfading in sync with the
 * rotating headline. Dark theme: the scene fills the section under a dark
 * veil. Light theme: the same scene sits in a framed banner (rounded,
 * ringed, shadowed) under a light veil, so ink text stays readable.
 * Decorative only (aria-hidden); only the active scene and the next one
 * are mounted, so first paint loads a single scene and the rest stream in
 * one dwell ahead of their turn. With prefers-reduced-motion the headline
 * never leaves line 0, so the first scene simply stays put.
 */
const HeroSceneBackdrop = ({ activeLineIndex }: HeroSceneBackdropProps) => {
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
      className="pointer-events-none absolute inset-2 overflow-hidden rounded-[1.5rem] shadow-2xl ring-1 ring-foreground/10 sm:inset-3 sm:rounded-[2rem] dark:inset-0 dark:rounded-none dark:shadow-none dark:ring-0"
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
      {/* Veils, keyed to the theme's own background color so one recipe
          serves both themes: enough cover behind the left text column for
          the headline, sub and CTAs to stay legible, opening up toward
          the right so the people stay visible. */}
      <div className="absolute inset-0 bg-background/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/60 to-background/30 lg:from-background/90 lg:via-background/55 lg:to-background/10" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background/45" />
    </div>
  );
};

export default HeroSceneBackdrop;
