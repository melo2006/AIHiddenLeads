import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";

/**
 * Film gallery (2026-11-20) — the testimonial-style example films,
 * placed directly under the hero.
 *
 * Data-driven: FILMS is the testimonial catalogue. To add a film,
 * append one entry, drop its poster into
 * public/videos/testimonials/, and set its YouTube id once the film
 * is uploaded. Every catalogue film lives in the scrollable row;
 * FILMS[0] (Frank & Susan) leads it.
 *
 * Above the row sits the INTRO film (Ron, 2026-11-27): the 6:44
 * Aspen film that introduces the whole service. It is NOT part of
 * FILMS — it gets its own top slot with a clickable chapter index
 * beside the player (INTRO_CHAPTERS). A chapter tap seeks the
 * player to ~2s before the chapter starts so the first word is
 * never eaten.
 *
 * Playback is a YouTube facade: each card and the intro slot show a
 * LOCAL poster + play button, and no iframe exists in the DOM until
 * a tap. The INTRO plays inline in its phone frame (large enough
 * for the full YouTube chrome). ROW films open in a big lightbox
 * player instead — YouTube hides the seek bar and fullscreen button
 * on small embeds, so a tapped card must never play squeezed into
 * its card (Ron's correction, 2026-11-20). Only one film plays at a
 * time — opening another resets the previous one back to its facade.
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
    slug: "frank-pool-dialogue",
    narrator: "Frank & his wife",
    business: "A-B-C Pool Cleaning",
    industry: "Pool Cleaning",
    runtime: "2:04",
    blurb:
      "Told together: a pool emergency, a string of unanswered calls, and the one company that picked up.",
    youtubeId: "rh4I6bsEcOg",
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
    youtubeId: "RG2saPORnG4",
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
    youtubeId: "BevOXGmhKBs",
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
    youtubeId: "ffU6UsQFJqQ",
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
    youtubeId: "sGgyUdc8C80",
    poster: "/videos/testimonials/linda-chiro.jpg",
  },
  {
    slug: "ray-machine-shop",
    narrator: "Ray",
    business: "Delgado Precision",
    industry: "Machine Shop",
    runtime: "2:16",
    blurb:
      "Two years of paid ads sent visitors to a silent website. Now Aspen books them — and Ray wakes up to a filled calendar.",
    youtubeId: "6C-4kaDodjc",
    poster: "/videos/testimonials/ray-machine-shop.jpg",
  },
];

/**
 * The intro film (2026-11-27) — Aspen's 6:44 introduction to the
 * whole service, published on the channel 2026-11-27. It holds the
 * top slot of this section; the testimonial catalogue (FILMS) sits
 * below it in the row.
 */
export const INTRO_FILM = {
  slug: "aspen-intro",
  title: "Meet Aspen — the A.I. Receptionist Who Answers Every Call",
  runtime: "6:44",
  blurb:
    "Aspen hosts the whole story: two customers whose calls went unanswered everywhere else, the numbers behind the missed-call problem, how she learns your business, what it costs, and how Alex gets you set up.",
  youtubeId: "ls4E4dKRybA",
  poster: "/videos/testimonials/aspen-intro.jpg",
};

export interface IntroChapter {
  label: string;
  /** Display time in the film, m:ss. */
  time: string;
  /** Chapter start, seconds into the film. */
  startSeconds: number;
  /** One plain sentence on what the chapter covers. */
  description: string;
}

/**
 * Chapter index for the intro film — V7.7 timings (chapter map,
 * 2026-11-26). Jumps land CHAPTER_LEAD_IN_SECONDS before the listed
 * start so a tap never eats the chapter's first word.
 */
export const INTRO_CHAPTERS: IntroChapter[] = [
  {
    label: "Cold open",
    time: "0:00",
    startSeconds: 0,
    description:
      "It starts with the sound every business owner knows: a phone that rings and rings.",
  },
  {
    label: "Frank's story",
    time: "0:07",
    startSeconds: 7,
    description:
      "Frank tried five pool companies from his own backyard — voicemail every time, until one website answered.",
  },
  {
    label: "Susan walks in",
    time: "0:27",
    startSeconds: 27,
    description:
      "Frank's wife Susan shows what happened instead: booked for tomorrow morning, confirmed by text.",
  },
  {
    label: "The 85% number",
    time: "0:45",
    startSeconds: 45,
    description:
      "85% of callers who reach voicemail never call back — Aspen puts the number on screen.",
  },
  {
    label: "Dave's story",
    time: "0:57",
    startSeconds: 57,
    description:
      "Dave needed a pump kit with twelve guests boarding at nine — and only one marine supplier's website answered.",
  },
  {
    label: "The 78% number",
    time: "2:18",
    startSeconds: 138,
    description:
      "78% of customers abandon a business after just one unanswered call.",
  },
  {
    label: "The payoff",
    time: "2:32",
    startSeconds: 152,
    description:
      "Frank and Dave's stories — and dozens more like them — are right here on this website.",
  },
  {
    label: "Meet Aspen",
    time: "2:54",
    startSeconds: 174,
    description:
      "Aspen introduces herself: a live video avatar who greets your visitors and answers your calls.",
  },
  {
    label: "The problem",
    time: "3:20",
    startSeconds: 200,
    description:
      "Every business that runs on calls loses the ones it never hears ring.",
  },
  {
    label: "She learns your business",
    time: "4:20",
    startSeconds: 260,
    description:
      "Aspen studies your website and your services, so she answers the way your own team would.",
  },
  {
    label: "Live demos on real websites",
    time: "4:45",
    startSeconds: 285,
    description:
      "Watch Aspen answer live on real business websites — and try one yourself in the examples below.",
  },
  {
    label: "Choose your spokesperson",
    time: "4:59",
    startSeconds: 299,
    description:
      "Pick the face and voice that fit your business from the presenter library.",
  },
  {
    label: "Pricing",
    time: "5:07",
    startSeconds: 307,
    description:
      "$99 a month for the voice service, the video avatar free for your first month, and this month's new-customer offer.",
  },
  {
    label: "Meet Alex — support & onboarding",
    time: "5:39",
    startSeconds: 339,
    description:
      "Alex and the setup wizard get you live in 20 to 30 minutes, and support stays with you after.",
  },
  {
    label: "The close",
    time: "5:58",
    startSeconds: 358,
    description:
      "The recap: what Aspen does, what it costs, and how to get started today.",
  },
];

/** Chapter jumps start this many seconds before the chapter itself. */
export const CHAPTER_LEAD_IN_SECONDS = 2;

/** Where a chapter tap actually lands the player (never below 0). */
export const chapterSeekSeconds = (startSeconds: number): number =>
  Math.max(0, startSeconds - CHAPTER_LEAD_IN_SECONDS);

/** The poster facade for the row cards: local poster + play
 *  overlay, and NO iframe in the DOM until the card is tapped. */
const FilmPosterButton = ({
  film,
  onPlay,
}: {
  film: Film;
  onPlay: () => void;
}) => (
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

/**
 * Big player for row films. At card size YouTube strips its own seek
 * bar and fullscreen button, so a row tap opens this lightbox: the
 * standard player at near-full height with every control, plus our
 * own close (X, backdrop tap, Escape) and prev/next story stepping.
 */
const FilmLightbox = ({
  film,
  onClose,
  onPrev,
  onNext,
}: {
  film: Film;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      data-film-lightbox
      role="dialog"
      aria-modal="true"
      aria-label={`${film.narrator} — ${film.business} video player`}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-full flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex w-full items-center justify-between gap-4">
          <p className="min-w-0 truncate text-sm font-semibold text-white sm:text-base">
            {film.narrator} — {film.business}
            <span className="ml-2 font-normal text-white/60">
              {film.industry} · {film.runtime}
            </span>
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div
          className="overflow-hidden rounded-2xl bg-black shadow-2xl"
          style={{ width: "min(92vw, 41.6dvh)" }}
        >
          <iframe
            key={film.slug}
            src={`https://www.youtube-nocookie.com/embed/${film.youtubeId}?autoplay=1&playsinline=1&rel=0`}
            title={`${film.narrator} — ${film.business} story`}
            allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            className="block aspect-[9/16] w-full bg-black"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous story"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next story"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${film.youtubeId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 text-xs text-white/50 underline underline-offset-2 transition-colors hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Watch on YouTube
        </a>
      </div>
    </div>
  );
};

/**
 * Intro spotlight — the top slot of the section (2026-11-27). Same
 * facade pattern as the catalogue films (poster, no iframe until a
 * tap), plus the chapter index beside the player. A chapter tap
 * (re)mounts the embed with ?start= at the lead-in position, which
 * is the seek mechanism the facade architecture allows; the index
 * stays visible while the film plays so chapters remain tappable.
 */
const IntroSpotlight = ({
  active,
  startSeconds,
  onPlay,
  onSeekChapter,
}: {
  active: boolean;
  startSeconds: number;
  onPlay: () => void;
  onSeekChapter: (startSeconds: number) => void;
}) => (
  <div
    data-intro-spotlight
    className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
  >
    <div className="flex flex-col items-center gap-6 p-5 sm:p-8 lg:flex-row lg:items-start lg:gap-10">
      {/* Phone-style frame around the portrait film. */}
      <div className="w-full max-w-[300px] shrink-0 rounded-[2rem] border border-border bg-black p-2 shadow-xl">
        <div className="overflow-hidden rounded-[1.6rem]">
          {active ? (
            <iframe
              key={startSeconds}
              src={`https://www.youtube-nocookie.com/embed/${INTRO_FILM.youtubeId}?autoplay=1&playsinline=1&rel=0${startSeconds > 0 ? `&start=${startSeconds}` : ""}`}
              title={INTRO_FILM.title}
              allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              className="block aspect-[9/16] h-full w-full bg-black"
            />
          ) : (
            <button
              type="button"
              onClick={onPlay}
              aria-label={`Play the intro film — ${INTRO_FILM.title}`}
              className="group relative block aspect-[9/16] h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            >
              <img
                src={INTRO_FILM.poster}
                alt="Aspen, the Ai Hidden Leads video-avatar receptionist"
                loading="lazy"
                className="block h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/25">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform group-hover:scale-105">
                  <Play className="ml-1 h-6 w-6" aria-hidden="true" />
                </span>
              </span>
              <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                {INTRO_FILM.runtime}
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 text-center lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          The film · {INTRO_FILM.runtime}
        </p>
        <h3 className="mt-2 text-2xl font-bold sm:text-3xl">
          {INTRO_FILM.title}
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
          {INTRO_FILM.blurb}
        </p>
        {!active && (
          <button
            type="button"
            onClick={onPlay}
            aria-label={`Play the intro film — ${INTRO_FILM.title}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
            Watch the film
          </button>
        )}
        <p className="mx-auto mt-6 max-w-xl text-sm text-muted-foreground lg:mx-0">
          Short on time? Jump to a chapter below — but the film is best
          watched whole: the two stories up front are what the numbers
          mean.
        </p>
        <nav aria-label="Intro film chapters" data-intro-chapters>
          <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1 text-left">
            {INTRO_CHAPTERS.map((chapter) => (
              <li key={chapter.startSeconds}>
                <button
                  type="button"
                  data-intro-chapter={chapter.startSeconds}
                  onClick={() => onSeekChapter(chapter.startSeconds)}
                  aria-label={`Jump to ${chapter.label} at ${chapter.time}`}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                    {chapter.time}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {chapter.label}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {chapter.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  </div>
);

const FilmCard = ({ film, onPlay }: { film: Film; onPlay: () => void }) => (
  <article
    data-film-card={film.slug}
    className="w-[200px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:w-[220px] lg:w-[240px]"
  >
    <FilmPosterButton film={film} onPlay={onPlay} />
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
  // Where the intro player (re)starts: 0 for a plain play, or the
  // lead-in position of the last chapter tapped.
  const [introStart, setIntroStart] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const rest = FILMS;

  const scrollRow = (direction: 1 | -1) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const playIntro = () => {
    setIntroStart(0);
    setPlaying(INTRO_FILM.slug);
  };

  const seekIntroChapter = (startSeconds: number) => {
    setIntroStart(chapterSeekSeconds(startSeconds));
    setPlaying(INTRO_FILM.slug);
  };

  // A playing ROW film lives in the lightbox, never inside its card.
  const activeRowIndex = rest.findIndex((f) => f.slug === playing);
  const activeRowFilm = activeRowIndex >= 0 ? rest[activeRowIndex] : null;
  const stepRowFilm = (direction: 1 | -1) => {
    if (activeRowIndex < 0) return;
    const next =
      rest[(activeRowIndex + direction + rest.length) % rest.length];
    setPlaying(next.slug);
  };

  return (
    <section
      id="customers"
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

        <IntroSpotlight
          active={playing === INTRO_FILM.slug}
          startSeconds={introStart}
          onPlay={playIntro}
          onSeekChapter={seekIntroChapter}
        />

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
              <FilmCard
                key={film.slug}
                film={film}
                onPlay={() => setPlaying(film.slug)}
              />
            ))}
          </div>
        </div>
      </div>
      {activeRowFilm && (
        <FilmLightbox
          film={activeRowFilm}
          onClose={() => setPlaying(null)}
          onPrev={() => stepRowFilm(-1)}
          onNext={() => stepRowFilm(1)}
        />
      )}
    </section>
  );
};

export default FilmGallery;
