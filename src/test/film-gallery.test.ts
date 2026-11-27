// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_LEAD_IN_SECONDS,
  FILMS,
  INTRO_CHAPTERS,
  INTRO_FILM,
  chapterSeekSeconds,
} from "../components/landing/FilmGallery";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

describe("film gallery data (2026-11-20)", () => {
  it("carries the six testimonial films, Frank & his wife's story leading the row (Ron, 2026-11-22: the hairy Frank is THE Frank; the solo cut was a different man and left the gallery. Ron, 2026-11-27: the intro film took the top slot and Frank & Susan moved down into the row)", () => {
    expect(FILMS).toHaveLength(6);
    expect(FILMS[0].slug).toBe("frank-pool-dialogue");
    expect(FILMS.map((f) => f.slug)).toEqual([
      "frank-pool-dialogue",
      "dave-marine",
      "karen-dental",
      "mike-roofing",
      "linda-chiro",
      "ray-machine-shop",
    ]);
  });

  it("every film carries its live YouTube id and a local poster under /videos/testimonials/", () => {
    // The films are published on the AI Hidden Leads channel
    // (@AIHiddenLeads, 2026-11-20); ids pinned so a swap is a deliberate edit.
    expect(FILMS.map((f) => f.youtubeId)).toEqual([
      "rh4I6bsEcOg",
      "RG2saPORnG4",
      "BevOXGmhKBs",
      "ffU6UsQFJqQ",
      "sGgyUdc8C80",
      "6C-4kaDodjc",
    ]);
    for (const film of FILMS) {
      expect(film.youtubeId).toMatch(/^[\w-]{11}$/);
      expect(film.poster).toBe(`/videos/testimonials/${film.slug}.jpg`);
      expect(film.narrator).toBeTruthy();
      expect(film.business).toBeTruthy();
      expect(film.industry).toBeTruthy();
      expect(film.runtime).toMatch(/^\d+:\d{2}$/);
      expect(film.blurb.length).toBeGreaterThan(20);
    }
  });
});

describe("intro film spotlight + chapter index (Ron, 2026-11-27)", () => {
  it("the intro film is its own top-slot entry, not a catalogue film", () => {
    expect(INTRO_FILM.slug).toBe("aspen-intro");
    expect(INTRO_FILM.youtubeId).toBe("ls4E4dKRybA");
    expect(INTRO_FILM.youtubeId).toMatch(/^[\w-]{11}$/);
    expect(INTRO_FILM.poster).toBe("/videos/testimonials/aspen-intro.jpg");
    expect(INTRO_FILM.runtime).toBe("6:44");
    expect(INTRO_FILM.title).toContain("Meet Aspen");
    expect(FILMS.map((f) => f.slug)).not.toContain(INTRO_FILM.slug);
    expect(FILMS.map((f) => f.youtubeId)).not.toContain(INTRO_FILM.youtubeId);
  });

  it("the chapter index carries the chapters Ron named, at the V7.7 times", () => {
    const byLabel = new Map(INTRO_CHAPTERS.map((c) => [c.label, c]));
    expect(byLabel.get("Frank's story")?.time).toBe("0:07");
    expect(byLabel.get("Dave's story")?.time).toBe("0:57");
    expect(byLabel.get("The 85% number")?.time).toBe("0:45");
    expect(byLabel.get("The 78% number")?.time).toBe("2:18");
    expect(byLabel.get("Choose your spokesperson")?.time).toBe("4:59");
    expect(byLabel.get("Pricing")?.time).toBe("5:07");
    expect(byLabel.get("Meet Alex — support & onboarding")?.time).toBe("5:39");
    expect(byLabel.get("The close")?.time).toBe("5:58");
    // Display time and startSeconds must agree, in film order, and
    // every chapter gets one plain description sentence.
    let prev = -1;
    for (const chapter of INTRO_CHAPTERS) {
      const expectedTime = `${Math.floor(chapter.startSeconds / 60)}:${String(
        chapter.startSeconds % 60,
      ).padStart(2, "0")}`;
      expect(chapter.time).toBe(expectedTime);
      expect(chapter.startSeconds).toBeGreaterThan(prev);
      prev = chapter.startSeconds;
      expect(chapter.description.length).toBeGreaterThan(20);
    }
    expect(INTRO_CHAPTERS[0].startSeconds).toBe(0);
  });

  it("a chapter tap lands ~2s before the chapter, clamped at 0", () => {
    expect(CHAPTER_LEAD_IN_SECONDS).toBe(2);
    expect(chapterSeekSeconds(0)).toBe(0);
    expect(chapterSeekSeconds(7)).toBe(5);
    expect(chapterSeekSeconds(138)).toBe(136);
    expect(chapterSeekSeconds(358)).toBe(356);
  });

  it("the intro renders at the top of the section, above the testimonial row, with its chapter index and the watch-it-whole line", () => {
    const section = read("components/landing/FilmGallery.tsx");
    const intro = section.indexOf("<IntroSpotlight");
    const row = section.indexOf("data-film-gallery-scroll");
    expect(intro).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(intro);
    expect(section).toContain("data-intro-spotlight");
    expect(section).toContain("data-intro-chapters");
    expect(section).toContain("data-intro-chapter={chapter.startSeconds}");
    expect(section).toContain("best\n          watched whole");
    // The seek: the intro embed remounts with &start= at the lead-in.
    expect(section).toContain(
      "https://www.youtube-nocookie.com/embed/${INTRO_FILM.youtubeId}?autoplay=1&playsinline=1&rel=0",
    );
    expect(section).toContain("&start=${startSeconds}");
    expect(section).toContain("onSeekChapter(chapter.startSeconds)");
  });
});

describe("film gallery placement + playback rules (2026-11-20)", () => {
  it("the homepage mounts the gallery directly under the hero, above Meet the team", () => {
    const index = read("pages/Index.tsx");
    const hero = index.indexOf("<HeroSection");
    const gallery = index.indexOf("<FilmGallery />");
    const team = index.indexOf("<TeamSection />");
    expect(hero).toBeGreaterThan(-1);
    expect(gallery).toBeGreaterThan(hero);
    expect(team).toBeGreaterThan(gallery);
  });

  it("the old founder intro video is off the homepage — hero no longer renders it", () => {
    const hero = read("components/landing/HeroSection.tsx");
    expect(hero).not.toContain("AspenIntroVideo");
    expect(hero).not.toContain("aspen-intro");
  });

  it("the section header is Ron's copy — and the dramatized-examples subline is gone", () => {
    const section = read("components/landing/FilmGallery.tsx");
    expect(section).toContain("EXAMPLES");
    expect(section).toContain("How customers are using AiHiddenLeads");
    expect(section).not.toContain("dramatized examples");
    expect(section).not.toContain("fictional businesses");
    expect(section).not.toContain("How Aspen helps businesses like yours");
  });

  it("playback is a YouTube facade: no iframe until tapped, no local <video> at all", () => {
    const section = read("components/landing/FilmGallery.tsx");
    expect(section).toContain(
      "https://www.youtube-nocookie.com/embed/${film.youtubeId}?autoplay=1&playsinline=1&rel=0",
    );
    expect(section).toContain("<iframe");
    expect(section).toContain("allowFullScreen");
    expect(section).not.toContain("<video");
    // Single playing-slug state is what enforces one film at a time:
    // opening another unmounts the previous iframe back to its facade.
    expect(section).toContain("useState<string | null>(null)");
    expect(section).toContain("data-film-gallery-scroll");
    expect(section).toContain("snap-x");
  });

  it("row films open in the big lightbox player, never squeezed into their card (Ron, 2026-11-20)", () => {
    const section = read("components/landing/FilmGallery.tsx");
    // YouTube strips its seek bar + fullscreen button on small embeds,
    // so a row tap gets the standard player at near-full height, with
    // our own close affordances and prev/next story stepping.
    expect(section).toContain("data-film-lightbox");
    expect(section).toContain('aria-label="Close player"');
    expect(section).toContain('"Escape"');
    // The player box needs a DEFINITE width: with width:auto the iframe
    // has no intrinsic ratio, and Android Chrome collapsed it to ~zero
    // height (black lightbox, Ron 2026-11-21). 41.6dvh = 74dvh × 9/16,
    // so the 9/16 frame still lands at most 74dvh tall.
    expect(section).toContain("min(92vw, 41.6dvh)");
    expect(section).toContain("Watch on YouTube");
  });
});
