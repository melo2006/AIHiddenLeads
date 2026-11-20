import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

/**
 * Film gallery (2026-11-20) — the testimonial-style example films,
 * placed directly under the hero.
 *
 * Data-driven: FILMS is the whole catalogue. To add a film, append
 * one entry, drop its poster into public/videos/testimonials/, and
 * set its YouTube id once the film is uploaded. The first entry is
 * the SPOTLIGHT (featured large); the rest form the scrollable row.
 * The spotlight slot is kept separable so a future wide (landscape)
 * film can take it over without touching the row.
 *
 * Playback is a YouTube facade: each card/spotlight shows its LOCAL
 * poster + play button, and no iframe exists in the DOM until a tap.
 * The tap swaps the poster for the standard YouTube player
 * (youtube-nocookie embed, autoplay on, controls + fullscreen from
 * the player itself). Only one film plays at a time — opening
 * another resets the previous one back to its facade.
 *
 * Copy is hardcoded English, following the hero's English strings.
 */

export interface Film {
  slug: string;
  narrator: string;
  business: string;
  industry: string;
  runtime: string;
  blurb: string;
  youtubeId: string;
  poster: string;
}

export const FILMS: Film[] = [
  {
    slug: "frank-pool",
    narrator: "Frank",
    business: "A-B-C Pool Cleaning",
    industry: "Pool Cleaning",
    runtime: "1:57",
    blurb:
      "Three pool companies never answered. The fourth had Aspen — and booked him on the spot.",
    youtubeId: "fHr843l4C_A",
    poster: "/videos/testimonials/frank-pool.jpg",
  },
  {
    slug: "frank-pool-dialogue",
    narrator: "Frank & his wife",
    business: "A-B-C Pool Cleaning",
    industry: "Pool Cleaning",
    runtime: "1:40",
    blurb:
      "Told together: a pool emergency, a string of unanswered calls, and the one company that picked up.",
    youtubeId: "Vah2-msyM5A",
    poster: "/videos/testimonials/frank-pool-dialogue.jpg",
  },
  {
    slug: "dave-marine",
    narrator: "Dave",
    business: "SunCoast Marine",
    industry: "Marine Services",
    runtime: "1:51",
    blurb:
      "The calls Dave's marina used to miss after hours now get answered, booked, and summarized.",
    youtubeId: "jXHLFQ0fgiE",
    poster: "/videos/testimonials/dave-marine.jpg",
  },
  {
    slug: "karen-dental",
    narrator: "Karen",
    business: "Sunset Dental Studio",
    industry: "Dental",
    runtime: "2:50",
    blurb:
      "A toothache on a Sunday, a string of voicemails — and the one practice whose Aspen picked up.",
    youtubeId: "rugB-2MmitM",
    poster: "/videos/testimonials/karen-dental.jpg",
  },
  {
    slug: "mike-roofing",
    narrator: "Mike",
    business: "SunBay Roofing",
    industry: "Roofing",
    runtime: "3:00",
    blurb:
      "A leak at 9 PM on a Saturday. Three roofers never answered. SunBay's Diego did.",
    youtubeId: "LVUvQdQT8_0",
    poster: "/videos/testimonials/mike-roofing.jpg",
  },
  {
    slug: "linda-chiro",
    narrator: "Linda",
    business: "SunHaven Chiropractic",
    industry: "Chiropractic",
    runtime: "3:20",
    blurb:
      "Her back went out on a Saturday morning — and Monica had her booked for Monday before lunch.",
    youtubeId: "MAHdsTRkKtI",
    poster: "/videos/testimonials/linda-chiro.jpg",
  },
];

interface FilmPlayerProps {
  film: Film;
  active: boolean;
  onPlay: () => void;
}

/**
 * Poster facade ⇄ YouTube player for one portrait film, sized by its
 * parent frame. Inactive: the local poster image with a play overlay,
 * and NO iframe in the DOM. Active: the youtube-nocookie embed with
 * autoplay; the standard player supplies controls and fullscreen.
 */
const FilmPlayer = ({ film, active, onPlay }: FilmPlayerProps) => {
  if (active) {
    return (
      <iframe
        key={film.slug}
        src={`https://www.youtube-nocookie.com/embed/${film.youtubeId}?autoplay=1&rel=0`}
        title={`${film.narrator} — ${film.business} story`}
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="block aspect-[9/16] h-full w-full bg-black"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${film.narrator}'s story — ${film.business}`}
      className="group relative block aspect-[9/16] h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
    >
      <img
        src={film.poster}
        alt={`${film.narrator} of ${film.business} — story poster`}
        loading="lazy"
        className="block h-full w-full object-cover"
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/25">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform group-hover:scale-105">
          <Play className="ml-1 h-6 w-6" aria-hidden="true" />
        </span>
      </span>
      <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
        {film.runtime}
      </span>
    </button>
  );
};

/** Spotlight — the featured film, kept separable from the row so a
 *  future wide (landscape) film can take this slot over. */
const FilmSpotlight = ({ film, active, onPlay }: FilmPlayerProps) => (
  <div
    data-film-spotlight
    className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
  >
    <div className="flex flex-col items-center gap-6 p-5 sm:p-8 md:flex-row md:gap-10">
      {/* Phone-style frame around the portrait film. */}
      <div className="w-full max-w-[280px] shrink-0 rounded-[2rem] border border-border bg-black p-2 shadow-xl">
        <div className="overflow-hidden rounded-[1.6rem]">
          <FilmPlayer film={film} active={active} onPlay={onPlay} />
        </div>
      </div>
      <div className="min-w-0 flex-1 text-center md:text-left">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {film.industry} · {film.runtime}
        </p>
        <h3 className="mt-2 text-2xl font-bold sm:text-3xl">
          {film.narrator} — {film.business}
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg md:mx-0">
          {film.blurb}
        </p>
        {!active && (
          <button
            type="button"
            onClick={onPlay}
            aria-label={`Play ${film.narrator}'s story — ${film.business}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
            Watch the story
          </button>
        )}
      </div>
    </div>
  </div>
);

const FilmCard = ({ film, active, onPlay }: FilmPlayerProps) => (
  <article
    data-film-card={film.slug}
    className="w-[200px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:w-[220px] lg:w-[240px]"
  >
    <FilmPlayer film={film} active={active} onPlay={onPlay} />
    <div className="px-3 py-3">
      <p className="text-sm font-semibold leading-snug text-foreground">
        {film.narrator} — {film.business}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {film.industry} · {film.runtime}
      </p>
    </div>
  </article>
);

const FilmGallery = () => {
  const [playing, setPlaying] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [spotlight, ...rest] = FILMS;

  const scrollRow = (direction: 1 | -1) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const playerProps = (film: Film): FilmPlayerProps => ({
    film,
    active: playing === film.slug,
    onPlay: () => setPlaying(film.slug),
  });

  return (
    <section
      data-film-gallery
      className="border-b border-primary/20 bg-background py-12 sm:py-16"
    >
      <div className="container mx-auto px-5 sm:px-6">
        <div className="mx-auto mb-8 max-w-3xl text-center sm:mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            EXAMPLES
          </p>
          <h2 className="mb-4 mt-2 text-3xl font-bold sm:text-4xl">
            How customers are using AiHiddenLeads
          </h2>
        </div>

        <FilmSpotlight {...playerProps(spotlight)} />

        <div className="mt-8">
          <div className="mb-3 hidden justify-end gap-2 md:flex">
            <button
              type="button"
              onClick={() => scrollRow(-1)}
              aria-label="Previous stories"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollRow(1)}
              aria-label="Next stories"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div
            ref={rowRef}
            data-film-gallery-scroll
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {rest.map((film) => (
              <FilmCard key={film.slug} {...playerProps(film)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FilmGallery;
