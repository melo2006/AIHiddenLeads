// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FILMS } from "../components/landing/FilmGallery";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

describe("film gallery data (2026-11-20)", () => {
  it("carries the seven testimonial films, Frank's solo story in the spotlight slot", () => {
    expect(FILMS).toHaveLength(7);
    expect(FILMS[0].slug).toBe("frank-pool");
    expect(FILMS.map((f) => f.slug)).toEqual([
      "frank-pool",
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
      "fHr843l4C_A",
      "Vah2-msyM5A",
      "jXHLFQ0fgiE",
      "rugB-2MmitM",
      "LVUvQdQT8_0",
      "MAHdsTRkKtI",
      "pNozxd3K384",
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
      "https://www.youtube-nocookie.com/embed/${film.youtubeId}?autoplay=1&rel=0",
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
    expect(section).toContain("max-h-[74dvh]");
    expect(section).toContain("Watch on YouTube");
  });
});
