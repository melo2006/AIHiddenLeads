import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  LayoutDashboard,
  MapPin,
  MoonStar,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneMissed,
  Play,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import LandingNavbar from "@/components/landing/LandingNavbar";
import Footer from "@/components/landing/Footer";
import TryWebsiteCTA from "@/components/landing/TryWebsiteCTA";
import PricingSection from "@/components/landing/PricingSection";
import TeamSection from "@/components/landing/TeamSection";
import GeminiAgentWidget from "@/components/GeminiAgentWidget";
import AssistantErrorBoundary from "@/components/AssistantErrorBoundary";
import aspenPortrait from "@/assets/aspen-idle-wave.gif";
// Final hero photos — the 8-slide set Ron approved in chat
// (2026-11-11), sourced from ~/workspace/hero-approved/.
import realtorSoldPhoto from "@/assets/realtor-hero-sold.jpg";
import realtorCondoPhoto from "@/assets/realtor-hero-condo.jpg";
import realtorKeysPhoto from "@/assets/realtor-hero-keys.jpg";
import realtorHousePhoto from "@/assets/realtor-hero-house-qr.jpg";
import realtorCouplePhoto from "@/assets/realtor-hero-couple.jpg";
import realtorAerialPhoto from "@/assets/realtor-hero-fll-aerial.jpg";
import realtorBeachPhoto from "@/assets/realtor-hero-fll-beach.jpg";
import realtorDallasPhoto from "@/assets/realtor-hero-dallas.jpg";
import exampleThumbAureliaPerez from "@/assets/realtor-example-aurelia-perez.webp";
import exampleThumbAnnChamberlain from "@/assets/realtor-example-ann-chamberlain.webp";
import exampleThumbAshleyCusack from "@/assets/realtor-example-ashley-cusack.webp";
import exampleThumbMauricioBarba from "@/assets/realtor-example-mauricio-barba.webp";
import exampleThumbMichaelMartinez from "@/assets/realtor-example-michael-martinez.webp";
import exampleThumbAlexaScalone from "@/assets/realtor-example-alexa-scalone.webp";
import exampleThumbJeanLucAndriot from "@/assets/realtor-example-jean-luc-andriot.webp";
import exampleThumbPaulSaperstein from "@/assets/realtor-example-paul-saperstein.webp";
import exampleThumbBaldemarDeLeon from "@/assets/realtor-example-baldemar-deleon.webp";
import exampleThumbLoganWalter from "@/assets/realtor-example-logan-walter.webp";
import exampleThumbRayMiramontes from "@/assets/realtor-example-ray-miramontes.webp";
import exampleThumbDanielleLazier from "@/assets/realtor-example-danielle-lazier.webp";
import exampleThumbRichardSteinberg from "@/assets/realtor-example-richard-steinberg.webp";
import exampleThumbGianSexsmith from "@/assets/realtor-example-gian-sexsmith.webp";
import type { AgentVertical } from "@/data/agentVerticals";

// Example-grid thumbnails (Batch 2, 2026-11-12): one per demo example,
// keyed by the option's slug in the vertical data. Each image is a real
// capture of that agent's own website with Aspen open on it (see
// batch2-build-report-2026-11-12.md for how they were produced).
const EXAMPLE_THUMBNAILS: Record<string, string> = {
  "aurelia-perez": exampleThumbAureliaPerez,
  "ann-chamberlain": exampleThumbAnnChamberlain,
  "ashley-cusack": exampleThumbAshleyCusack,
  "mauricio-barba": exampleThumbMauricioBarba,
  "michael-martinez": exampleThumbMichaelMartinez,
  "alexa-scalone": exampleThumbAlexaScalone,
  "jean-luc-andriot": exampleThumbJeanLucAndriot,
  "paul-saperstein": exampleThumbPaulSaperstein,
  "baldemar-deleon": exampleThumbBaldemarDeLeon,
  "logan-walter": exampleThumbLoganWalter,
  "ray-miramontes": exampleThumbRayMiramontes,
  "danielle-lazier": exampleThumbDanielleLazier,
  "richard-steinberg": exampleThumbRichardSteinberg,
  "gian-sexsmith": exampleThumbGianSexsmith,
};

/**
 * Hero slideshow images, keyed by the `key` each vertical's heroSlides
 * data carries — a vertical only ever shows its own photos, and a
 * vertical with no heroSlides renders no slideshow at all.
 */
const heroSlideImages: Record<string, string> = {
  sold: realtorSoldPhoto,
  condo: realtorCondoPhoto,
  keys: realtorKeysPhoto,
  house: realtorHousePhoto,
  couple: realtorCouplePhoto,
  aerial: realtorAerialPhoto,
  beach: realtorBeachPhoto,
  dallas: realtorDallasPhoto,
};

/** How long each hero slide stays up before crossfading to the next. */
const HERO_SLIDE_ROTATE_MS = 5600;

/** Horizontal swipe distance (px) that counts as a slide change. */
const HERO_SWIPE_MIN_PX = 40;

/**
 * Full-bleed hero slideshow — a panoramic photo fills the band as the
 * background (object-cover, per-slide focal classes), a dark gradient
 * scrim keeps the overlaid slogan legible, and photo + slogan crossfade
 * together as pairs. Controls: dot indicators jump to a slide, prev/next
 * chevron buttons step through, a pause/play toggle stops or resumes
 * the rotation, and a touch swipe moves between slides. Taking manual
 * control (dot, arrow, swipe) pauses auto-rotation until play is
 * pressed; hovering or focusing the band pauses it only while the
 * pointer/focus stays. A visitor who prefers reduced motion gets
 * slide 1, static — no rotation — with every control still usable.
 */
const HeroSlideshow = ({
  slides,
  credit,
}: {
  slides: NonNullable<AgentVertical["heroSlides"]>;
  credit?: string;
}) => {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  // Transient pause while the pointer hovers or focus is inside.
  const [hoverPaused, setHoverPaused] = useState(false);
  // Sticky pause: the pause/play toggle, or any manual navigation.
  const [userPaused, setUserPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const goTo = (index: number) => {
    setActive(((index % slides.length) + slides.length) % slides.length);
    setUserPaused(true);
  };
  const goPrev = () => goTo(active - 1);
  const goNext = () => goTo(active + 1);

  useEffect(() => {
    if (reduceMotion || hoverPaused || userPaused || slides.length < 2)
      return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length);
    }, HERO_SLIDE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion, hoverPaused, userPaused, slides.length]);

  const controlButtonClass =
    "flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

  return (
    <div>
      <div
        data-agent-hero-slides
        role="region"
        aria-roledescription="carousel"
        aria-label="Real estate scenes — South Florida and nationwide"
        className="relative h-[250px] overflow-hidden rounded-2xl border border-primary/25 shadow-2xl shadow-primary/10 sm:h-[350px] lg:h-[430px]"
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
        {slides.map((slide, i) => {
          const src = heroSlideImages[slide.key];
          if (!src) return null;
          const isActive = i === active;
          return (
            <div
              key={slide.key}
              aria-hidden={!isActive}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                isActive ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <img
                src={src}
                alt={isActive ? slide.alt : ""}
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
                className={`h-full w-full object-cover ${slide.focusClass}`}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 px-14 pt-6 pb-12 sm:px-[4.5rem] sm:pt-10 sm:pb-14">
                <p className="max-w-2xl text-2xl font-bold leading-tight text-white drop-shadow-md sm:text-5xl">
                  {slide.slogan}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-white/80">
                  {slide.caption}
                </p>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous slide"
          className={`${controlButtonClass} absolute left-3 top-1/2 z-10 -translate-y-1/2`}
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Next slide"
          className={`${controlButtonClass} absolute right-3 top-1/2 z-10 -translate-y-1/2`}
        >
          <ChevronRight className="h-6 w-6" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setUserPaused((value) => !value)}
          aria-label={userPaused ? "Play slideshow" : "Pause slideshow"}
          aria-pressed={userPaused}
          className={`${controlButtonClass} absolute right-4 top-4 z-10`}
        >
          {userPaused ? (
            <Play className="h-5 w-5" aria-hidden />
          ) : (
            <Pause className="h-5 w-5" aria-hidden />
          )}
        </button>
        <div className="absolute bottom-4 right-5 z-10 flex gap-2 sm:right-8">
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show slide ${i + 1}: ${slide.caption}`}
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
      {credit && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {credit}
        </p>
      )}
    </div>
  );
};

const painIcons = [PhoneMissed, MoonStar, Clock];
const controlIcons = [Phone, PhoneForwarded, Flame, CalendarCheck];
/** Attention-section tiles: farming (local presence), placement
 *  (top of the list), the answer (Aspen picks up). */
const attentionIcons = [MapPin, Sparkles, PhoneCall];

/** Hero benefit bullets — big, friendly icons, shared by every vertical. */
const heroBenefits = [
  { icon: PhoneCall, label: "Answered in seconds — 24/7" },
  { icon: CalendarCheck, label: "Booked straight onto your calendar" },
  { icon: PhoneForwarded, label: "Hot leads warm-transferred to your phone" },
  { icon: LayoutDashboard, label: "Every lead lands in your dashboard" },
];

/**
 * Subtle fade/slide-in reveal on scroll for plain page sections (the
 * card grids carry their own framer-motion reveals). Renders a plain
 * wrapper when the visitor prefers reduced motion — no movement at all.
 */
const Reveal = ({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) => {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/**
 * Shared template for every agent-vertical landing page (~80% shared:
 * layout, Aspen hero/demo, free-demo CTA, $99 pricing block, FAQ shell,
 * footer — change once here and every vertical updates). The vertical
 * data supplies the top ~20%: headline, pains, sample call, later
 * add-ons, FAQ.
 */
const AgentLandingTemplate = ({ vertical }: { vertical: AgentVertical }) => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [heroWebsite, setHeroWebsite] = useState("");
  const [heroNote, setHeroNote] = useState("");

  // Hero demo form — hands off to the existing /demo flow exactly like
  // TryWebsiteCTA does (navigate to /demo), with the website carried in
  // the ?url= param TryDemo already pre-fills from. The optional note has
  // no supported field in that flow, so it rides client-side in router
  // state only — it is never sent to a backend or stored as a lead field.
  const handleHeroDemoSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const website = heroWebsite.trim();
    if (!website) return;
    const note = heroNote.trim();
    navigate(
      `/demo?url=${encodeURIComponent(website)}`,
      note ? { state: { aspenNote: note } } : undefined,
    );
  };

  // One-click example demos — picking an example launches the demo on
  // that site immediately, through the same /demo handoff as a typed
  // URL, marked as a sample launch (sample=1) and carrying the generic
  // visitor name the data entry supplies (callerName — the param the
  // demo flow already threads into the session's visitorName).
  const runExampleDemo = (exampleUrl: string) => {
    if (!exampleUrl || !vertical.demoExamples) return;
    navigate(
      `/demo?url=${encodeURIComponent(exampleUrl)}&sample=1&callerName=${encodeURIComponent(vertical.demoExamples.visitorName)}`,
    );
  };

  const handleExampleSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    runExampleDemo(event.target.value);
  };

  // The attention section's sting is the vertical's verified
  // never-answered figure, rendered from its stats entry (value,
  // label and source exactly as approved) — never a second copy of
  // the number that could drift from the evidence section.
  const attentionStat = vertical.attention
    ? vertical.stats.find((stat) => stat.value === "48%")
    : undefined;

  return (
    <div className="landing-page min-h-screen bg-background overflow-x-hidden">
      {/* Slim top contact bar — agent pages only, above the navbar. Both
          numbers ring Aspen on the Telnyx bridge, live right now. The bar
          is fixed at h-10, so the shared navbar is offset below it via
          the wrapper (the navbar component itself is untouched). */}
      <div
        data-agent-contact-bar
        className="fixed top-0 inset-x-0 z-[100] h-10 bg-primary text-primary-foreground"
      >
        <div className="container mx-auto flex h-full items-center justify-center gap-3 px-3 sm:gap-4">
          <a
            href="tel:+18778624949"
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold hover:underline sm:text-xs"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            1-877-862-4949 (toll-free)
          </a>
          <span aria-hidden className="text-primary-foreground/50">
            ·
          </span>
          <a
            href="tel:+17723624949"
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold hover:underline sm:text-xs"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            (772) 362-4949 (local)
          </a>
          <span className="hidden items-center gap-2 text-[11px] font-medium sm:inline-flex sm:text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground" />
            </span>
            Aspen answers live right now
          </span>
        </div>
      </div>
      <div aria-hidden className="h-10" />
      <div className="[&>nav]:top-10">
        <LandingNavbar />
      </div>

      {/* Hero — vertical headline + sub, shared Aspen portrait + demo CTA.
          Batch 1 (2026-11-12): the wide empty black band Ron saw above the
          hero. The two fixed bars are NOT the waste — the h-10 spacer above
          exactly matches the fixed contact bar and LandingNavbar's own
          spacer exactly matches the fixed navbar (offset top-10), so both
          spacers stay or content slides under a bar. The reducible empty
          space was this section's top padding plus the mt-10/sm:mt-12 gap
          under the slideshow; both shrink to a small breathing room here
          and below, lifting every vertical's hero (slides or not). */}
      <section className="relative overflow-hidden pt-1 sm:pt-2 pb-8 sm:pb-10">
        <div className="container mx-auto px-5 sm:px-6 relative z-10">
          {/* Hero slideshow — full-bleed photo band at the very top of
              the hero, data-driven: only renders when the vertical
              carries heroSlides. The H1, demo form and everything else
              stay below it on the solid background. */}
          {vertical.heroSlides && vertical.heroSlides.length > 0 && (
            <HeroSlideshow
              slides={vertical.heroSlides}
              credit={vertical.heroSlidesCredit}
            />
          )}
          <div
            className={`flex flex-col lg:flex-row items-center gap-8 lg:gap-10 ${
              vertical.heroSlides?.length ? "mt-4 sm:mt-6" : ""
            }`}
          >
            <div className="min-w-0 w-full flex-1 text-center lg:text-left">
              {/* Badge pill — suppressed on slideshow verticals: the
                  pill's phrases live on as slide slogans there, so
                  showing both would duplicate them. */}
              {!vertical.heroSlides?.length && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 rounded-full border border-primary/20 bg-primary/5 mb-4 sm:mb-5"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  <span className="text-xs sm:text-base font-medium text-primary">
                    {vertical.badgeLine ?? vertical.builtFor}
                  </span>
                </motion.div>
              )}

              <motion.h1
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-5"
              >
                {vertical.headline}
              </motion.h1>

              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-6"
              >
                {vertical.sub}
              </motion.p>

              {/* Spend-hook tagline (owner-approved verbatim
                  2026-11-12) — directly under the hero headline/sub,
                  data-driven so only verticals that carry it render
                  it. */}
              {vertical.heroTagline && (
                <motion.div
                  data-agent-hero-tagline
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.25 }}
                  className="max-w-xl mx-auto lg:mx-0 mb-6"
                >
                  <p className="text-xl sm:text-2xl font-bold leading-snug text-foreground">
                    {vertical.heroTagline}
                  </p>
                  {vertical.heroTaglineSub && (
                    <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
                      {vertical.heroTaglineSub}
                    </p>
                  )}
                </motion.div>
              )}

              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex w-full min-w-0 flex-col sm:flex-row sm:flex-wrap gap-3 justify-center lg:justify-start mb-5"
              >
                <Button
                  onClick={() => navigate("/demo")}
                  size="lg"
                  className="h-auto min-h-12 max-w-full whitespace-normal break-words text-base sm:text-lg px-4 py-3 bg-primary text-primary-foreground hover:bg-primary/90 glow-border rounded-xl font-semibold"
                >
                  Try it free on your own website and see your website come alive
                </Button>
                <Button
                  onClick={() => navigate("/plans?plan=essentials")}
                  variant="ghost"
                  size="sm"
                  className="h-auto whitespace-normal px-2 py-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  <ArrowRight className="h-4 w-4 shrink-0" />
                  See the $99 plan
                </Button>
              </motion.div>

              <motion.p
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.35 }}
                className="text-sm font-medium text-foreground max-w-xl mx-auto lg:mx-0"
              >
                See your own website come alive in about 2 minutes. No signup, no card.
              </motion.p>

              <motion.form
                data-agent-hero-form
                onSubmit={handleHeroDemoSubmit}
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="w-full max-w-xl mx-auto lg:mx-0 rounded-2xl border border-border bg-card p-4 sm:p-5 text-left shadow-sm mb-6"
              >
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="agent-hero-website"
                      className="block text-sm font-semibold text-foreground mb-1.5"
                    >
                      Your website URL
                    </label>
                    <Input
                      id="agent-hero-website"
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      required
                      value={heroWebsite}
                      onChange={(event) => setHeroWebsite(event.target.value)}
                      placeholder="e.g. janesellsflorida.com"
                      className="h-12 text-base"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="agent-hero-note"
                      className="block text-sm font-semibold text-foreground mb-1.5"
                    >
                      Anything Aspen should know? (optional)
                    </label>
                    <Input
                      id="agent-hero-note"
                      type="text"
                      value={heroNote}
                      onChange={(event) => setHeroNote(event.target.value)}
                      placeholder="e.g. I sell mostly condos in Fort Lauderdale"
                      className="h-12 text-base"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full h-auto min-h-12 whitespace-normal py-3 text-base font-semibold rounded-xl"
                  >
                    See your website come alive — under 2 minutes
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Free demo. No signup, no card.
                  </p>
                  {vertical.demoExamples && (
                    <div
                      data-agent-demo-examples
                      className="border-t border-border pt-3"
                    >
                      <label
                        htmlFor="agent-hero-example"
                        className="block text-sm font-semibold text-foreground mb-1.5"
                      >
                        {vertical.demoExamples.intro}
                      </label>
                      <select
                        id="agent-hero-example"
                        defaultValue=""
                        onChange={handleExampleSelect}
                        className="h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="" disabled>
                          {vertical.demoExamples.placeholder}
                        </option>
                        {vertical.demoExamples.groups.map((group) => (
                          <optgroup key={group.area} label={group.area}>
                            {group.options.map((option) => (
                              <option key={option.url} value={option.url}>
                                {option.agent} — {option.city}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </motion.form>

              <motion.ul
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.45 }}
                className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 max-w-xl mx-auto lg:mx-0 text-left"
              >
                {heroBenefits.map((benefit) => (
                  <li key={benefit.label} className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <benefit.icon className="w-6 h-6 text-primary" />
                    </span>
                    <span className="text-sm font-medium text-foreground leading-snug">
                      {benefit.label}
                    </span>
                  </li>
                ))}
              </motion.ul>
            </div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="flex-shrink-0 w-full lg:w-[420px] flex flex-col items-center"
            >
              <div className="relative">
                <button
                  type="button"
                  aria-label="Talk to Aspen"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("open-homepage-aspen", {
                        detail: { mode: "voice", start: true },
                      }),
                    )
                  }
                  className="rounded-2xl cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <img
                    src={aspenPortrait}
                    alt="Aspen, your AI receptionist, speaking live"
                    className="aspect-[4/5] w-full max-w-[280px] object-cover object-top rounded-2xl shadow-2xl sm:max-w-[360px] lg:aspect-auto lg:h-auto lg:max-h-[540px] lg:max-w-full"
                  />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate("/demo");
                  }}
                  className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Try it on your website — free
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Aspen, live on this page — tap to talk
              </p>
            </motion.div>
          </div>

        </div>
      </section>

      {/* Examples grid (Batch 2, 2026-11-12) — directly below the hero
          demo form: what Aspen looks like answering on real agents'
          websites. Honest framing: these are example simulations, NOT
          customers. The frame shows two rows at a time; the rest scroll
          INSIDE the frame so the page never grows a 14-card strip.
          Clicking a card runs the live demo on that site immediately —
          the same /demo sample handoff as the hero dropdown. */}
      {vertical.demoExamples && (
        <section
          data-agent-example-grid
          className="border-b border-primary/20 bg-background py-12 sm:py-16"
        >
          <div className="container mx-auto px-5 sm:px-6">
            <div className="max-w-3xl mx-auto text-center mb-8">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                What your website could look like
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg">
                These are example simulations — real agents' websites, not
                our customers — each with Aspen answering on it. Click any
                one and the demo starts live on that site. On your site,
                she leads with your listings first.
              </p>
            </div>
            <div className="max-w-5xl mx-auto rounded-2xl border border-border bg-card p-3 sm:p-4">
              <div
                data-agent-example-grid-scroll
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[572px] sm:max-h-[500px] lg:max-h-[528px] overflow-y-auto pr-1"
              >
                {vertical.demoExamples.groups
                  .flatMap((group) => group.options)
                  .map((option) => (
                    <button
                      key={option.url}
                      type="button"
                      onClick={() => runExampleDemo(option.url)}
                      aria-label={`Run the live demo on ${option.agent}'s website`}
                      className="group block w-full text-left rounded-xl border border-border bg-background overflow-hidden shadow-sm transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <img
                        src={EXAMPLE_THUMBNAILS[option.slug]}
                        alt={`${option.agent}'s website with Aspen answering on it`}
                        loading="lazy"
                        className="aspect-[16/10] w-full object-cover object-top"
                      />
                      <span className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {option.agent}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {option.city}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-primary">
                          Run the demo
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Scroll inside the frame to see all 14 examples. Each demo is a
              simulation — Aspen answers as that site's receptionist,
              listings first.
            </p>
          </div>
        </section>
      )}

      {/* You already bought the attention (owner-approved
          2026-11-12) — between the examples grid and the stats band:
          the agent's spend (farming + placement) ends at a ringing
          phone or a website visit, and Aspen is the answer for that
          moment. The sting is the verified 48% stat, rendered from
          the vertical's stats data with its approved wording/source.
          The social strip presents social media management as an
          available add-on only — no invented results. */}
      {vertical.attention && (
        <section
          data-agent-attention
          className="py-14 sm:py-20 bg-secondary/20 border-b border-border"
        >
          <div className="container mx-auto px-5 sm:px-6">
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                {vertical.attention.heading}
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
                The attention is already paid for. What happens in the
                seconds after it lands is what decides whether it pays
                off.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {vertical.attention.tiles.map((tile, i) => {
                const Icon = attentionIcons[i] || PhoneCall;
                return (
                  <motion.div
                    key={tile.title}
                    initial={reduceMotion ? false : { opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="rounded-2xl border border-border bg-card p-6 sm:p-8"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold leading-snug">
                        {tile.title}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {tile.body}
                    </p>
                  </motion.div>
                );
              })}
            </div>
            {attentionStat && (
              <div className="mt-10 max-w-3xl mx-auto text-center">
                <p className="text-4xl sm:text-5xl font-extrabold text-primary">
                  {attentionStat.value}
                </p>
                <p className="mt-2 text-base sm:text-lg text-foreground leading-snug">
                  {attentionStat.label}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Source: {attentionStat.source}
                </p>
              </div>
            )}
            <div className="mt-10 max-w-3xl mx-auto rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8 text-center">
              <p className="text-base sm:text-lg font-medium text-foreground leading-relaxed">
                {vertical.attention.socialStrip}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Social media management is an available add-on — ask
                Aspen about it.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Stat bar — the verified headline figures */}
      <section className="border-y border-primary/20 bg-primary/5 py-8">
        <div className="container mx-auto px-5 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto text-center">
            {vertical.stats.slice(0, 4).map((stat) => (
              <div key={stat.value}>
                <p className="text-3xl sm:text-4xl font-extrabold text-primary">
                  {stat.barValue ?? stat.value}
                </p>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-snug">
                  {stat.barLabel ?? stat.label}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Sources: WAV Group Agent Responsiveness Study, via Inman · NAR
            2025 · MIT / InsideSales Lead Response Management Study — full
            sources in the evidence section below.
          </p>
        </div>
      </section>

      {/* The vertical's 3 pains */}
      <section className="py-14 sm:py-20">
        <div className="container mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              The calls you miss are the clients you lose
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              None of this is about working harder. It is about what happens in
              the minutes when you cannot pick up.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {vertical.pains.map((pain, i) => {
              const Icon = painIcons[i] || PhoneMissed;
              return (
                <motion.div
                  key={pain.title}
                  initial={reduceMotion ? false : { opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-2xl border border-border bg-card p-6 sm:p-8"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold leading-snug">
                      {pain.title}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {pain.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Sample Aspen call — from this vertical's world */}
      <section className="py-14 sm:py-20 bg-secondary/20 border-y border-border">
        <div className="container mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
              Sample call
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              What Aspen does when a buyer calls
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              You are at a showing. Your phone rings in your pocket. Here is
              what happens instead of voicemail.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
              <h3 className="text-xl font-semibold mb-5">
                {vertical.sampleCall.buyerTitle}
              </h3>
              <ol className="space-y-3">
                {vertical.sampleCall.buyerSteps.map((step, i) => (
                  <li key={step} className="flex items-start gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground leading-relaxed">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8 flex flex-col">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-xl font-semibold leading-snug">
                  {vertical.sampleCall.sellerTitle}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {vertical.sampleCall.sellerBody}
              </p>
              <Button
                onClick={() => navigate("/demo")}
                className="mt-6 w-full sm:w-auto"
              >
                Hear it on your own website — free
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* You stay in control — your phone rings first */}
      <section className="py-14 sm:py-20">
        <div className="container mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
              You stay in control
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              You're never out of the loop
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              Aspen is your backup, not your replacement. Your calls stay
              your calls — she only steps in when you can't.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {vertical.controlSteps.map((step, i) => {
              const Icon = controlIcons[i] || Phone;
              return (
                <motion.div
                  key={step.title}
                  initial={reduceMotion ? false : { opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="relative rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative shrink-0">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Icon className="w-8 h-8 text-primary" />
                      </div>
                      <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold text-foreground">
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold leading-snug">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.body}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* Dashboard — every lead, visible */}
          <div className="mt-8 max-w-6xl mx-auto rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <LayoutDashboard className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">
                    Every lead, in your dashboard
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Nothing happens in a black box. For every lead that comes
                  through Aspen, your dashboard shows the call summary and
                  transcript — so you can see exactly what was said before
                  you follow up.
                </p>
              </div>
              <ul className="flex-1 space-y-2.5">
                {vertical.dashboardPoints.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Calendar — bookings land on the agent's own calendar */}
      <section className="py-14 sm:py-20 bg-secondary/20 border-y border-border">
        <div className="container mx-auto px-5 sm:px-6">
          <Reveal className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                Your calendar
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Booked straight onto your calendar
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg">
                Not a message to chase later — a real appointment, on the
                calendar you already use.
              </p>
            </div>
            <ul className="space-y-4 mb-8">
              {vertical.calendar.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm sm:text-base">
                  <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 mb-8">
              <h3 className="text-lg font-semibold mb-3">
                Rescheduling, without the phone tag
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                {vertical.calendar.example}
              </p>
            </div>
            <p className="text-center text-base sm:text-lg font-medium text-foreground leading-relaxed">
              {vertical.calendar.framing}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Evidence — verified figures, sourced, plus the money math */}
      <section className="py-14 sm:py-20">
        <div className="container mx-auto px-5 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
              The evidence
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Speed wins the client. The numbers say so.
            </h2>
          </div>

          <Reveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto mb-6">
            {vertical.stats.slice(4).map((stat) => (
              <div
                key={stat.value}
                className="rounded-2xl border border-border bg-card p-6 text-center"
              >
                <p className="text-3xl font-extrabold text-primary">{stat.value}</p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {stat.label}
                </p>
              </div>
            ))}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <h3 className="text-lg font-semibold mb-2">Sound familiar?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {vertical.scenario}
              </p>
              <p className="mt-3 text-sm font-medium text-foreground">
                {vertical.scenarioPunchline}
              </p>
            </div>
          </Reveal>

          <p className="text-center text-[11px] text-muted-foreground max-w-3xl mx-auto mb-10">
            Sources: WAV Group Agent Responsiveness Study, via Inman (917
            minutes average response; 48% of inquiries unanswered) · NAR 2025
            (78% work with the first agent who responds) · MIT / InsideSales
            Lead Response Management Study (21x qualification at 5 minutes vs
            30 minutes) · Pied Piper Lead Handling Effectiveness Study 2026,
            2,198 inquiries (33% reached an agent; 73% no follow-up within 24
            hours).
          </p>

          {/* Money math — a labelled example, not a promise */}
          <Reveal className="max-w-3xl mx-auto rounded-2xl border border-primary/20 bg-card p-6 sm:p-10 text-center">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
              Example math — not a promise
            </Badge>
            <h3 className="text-2xl sm:text-3xl font-bold mb-4">
              What 1 missed closing costs
            </h3>
            {vertical.moneyMath.lines.map((line) => (
              <p
                key={line}
                className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-3"
              >
                {line}
              </p>
            ))}
            <p className="text-xl sm:text-2xl font-bold text-foreground mt-5">
              {vertical.moneyMath.punchline}
            </p>
            <p className="mt-4 text-[11px] text-muted-foreground">
              {vertical.moneyMath.source}. Commissions are negotiable; this
              example uses averages to show the scale, not a guarantee of any
              result.
            </p>
          </Reveal>
        </div>
      </section>

      <TryWebsiteCTA />

      {/* Meet the team — same component as the homepage, verbatim */}
      <TeamSection />

      {/* The full services list — same names as the homepage hero list,
          balanced checklist. Data-driven per vertical. */}
      {vertical.services && vertical.services.length > 0 && (
        <section className="py-14 sm:py-20 bg-secondary/20 border-y border-border">
          <div className="container mx-auto px-5 sm:px-6">
            <Reveal className="max-w-4xl mx-auto">
              <div className="text-center mb-10">
                <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                  The full toolkit
                </Badge>
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  More than call answering
                </h2>
                <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
                  Aspen answering your calls and your website is where it
                  starts. Behind her is the full AiHiddenLeads toolkit — the
                  same services every customer can grow into.
                </p>
              </div>
              <ul
                data-agent-services
                className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 max-w-3xl mx-auto"
              >
                {vertical.services.map((service) => (
                  <li key={service} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 text-primary" />
                    </span>
                    <span className="text-sm sm:text-base font-medium text-foreground leading-snug">
                      {service}
                    </span>
                  </li>
                ))}
                {vertical.slug === "realtors" && (
                  <li className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 text-primary" />
                    </span>
                    <span className="text-sm sm:text-base font-medium text-foreground leading-snug">
                      Your listings first — Aspen leads with your active
                      listings on every call and visit
                    </span>
                  </li>
                )}
              </ul>
              {vertical.prospectsNote && (
                <p className="mt-8 text-center text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  {vertical.prospectsNote}
                </p>
              )}
              <p className="mt-8 text-center text-sm text-muted-foreground">
                Aspen answering is the $99/mo start; the rest are available
                as add-ons or quoted scope when you want to grow.
              </p>
            </Reveal>
          </div>
        </section>
      )}

      {/* Focused Premium summary for this vertical (full shared pricing below) */}
      <section className="py-14 sm:py-20">
        <div className="container mx-auto px-5 sm:px-6">
          <Reveal className="max-w-3xl mx-auto rounded-2xl border border-primary/20 bg-card p-6 sm:p-10 text-center">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
              Premium
            </Badge>
            <div className="flex items-baseline justify-center gap-2 mb-3">
              <span className="text-5xl font-extrabold">$99</span>
              <span className="text-muted-foreground text-sm">/mo</span>
            </div>
            <p className="text-base font-medium text-foreground mb-2">
              400 minutes included. 400 minutes — almost nobody gives you
              this many at $99.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mx-auto mb-6">
              Aspen answers your calls and your website visitors, books the
              appointment, and sends you the summary. Same plan, same price as
              every AiHiddenLeads customer.
            </p>
            <ul className="text-left max-w-md mx-auto space-y-3 mb-8">
              {[
                "AI voice receptionist for calls and website visitors, 24/7",
                "Appointment booking with instant call summaries",
                "Optional live video avatar add-on — first month free, then $79/mo if you keep it, only if you want Aspen's live video face on your website",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{line}</span>
                </li>
              ))}
              {vertical.premiumProspectsBullet && (
                <li className="flex items-start gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    {vertical.premiumProspectsBullet}
                  </span>
                </li>
              )}
            </ul>
            {vertical.premiumProspectsBullet && (
              <p className="text-left max-w-md mx-auto text-xs text-muted-foreground -mt-5 mb-8">
                *Up to 50/month — no specific count guaranteed.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => navigate("/checkout?plan=essentials")}
                size="lg"
                className="px-8"
              >
                Start with Premium — $99/mo
              </Button>
              <Button
                onClick={() => navigate("/demo")}
                size="lg"
                variant="outline"
                className="px-8"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Try the free demo first
              </Button>
            </div>
            <p className="mt-5 text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Video className="w-4 h-4 text-primary" />
              No other small-business receptionist we found packages a live
              video receptionist like Aspen.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Full shared pricing (same component as the homepage) */}
      <PricingSection />

      {/* Later add-ons for this vertical — sold later, listed honestly */}
      <section className="py-14 sm:py-20">
        <div className="container mx-auto px-5 sm:px-6">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
              Later add-ons
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Start with never missing a call. Add these later.
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              These are add-on services you can layer on once Aspen is
              answering for you — not part of the $99 plan, and never required
              to start.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {vertical.laterAddOns.map((addon) => (
              <div
                key={addon.title}
                className="rounded-2xl border border-border bg-card p-6 flex flex-col"
              >
                <h3 className="text-lg font-semibold mb-2">{addon.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                  {addon.body}
                </p>
                <p className="text-xs text-primary font-medium mt-4">
                  Later add-on
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Areas we serve — visible locality strip near the bottom of
          the page, data-driven per vertical; renders only when the
          vertical carries serviceAreas. Plain visible text: the
          cities grouped by county, as pills under each county. */}
      {vertical.serviceAreas && (
        <section className="py-14 sm:py-20 border-t border-border">
          <div className="container mx-auto px-5 sm:px-6">
            <Reveal className="max-w-5xl mx-auto">
              <div className="text-center mb-10">
                <Badge
                  variant="outline"
                  className="mb-4 border-primary/30 text-primary"
                >
                  Areas we serve
                </Badge>
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  {vertical.serviceAreas.heading}
                </h2>
                <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
                  {vertical.serviceAreas.framing}
                </p>
              </div>
              <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {vertical.serviceAreas.homeTurfLabel}
              </p>
              <div
                data-agent-service-areas
                className="grid grid-cols-1 sm:grid-cols-3 gap-8"
              >
                {vertical.serviceAreas.counties.map((group) => (
                  <div key={group.county}>
                    <h3 className="flex items-center gap-2 text-base font-semibold mb-3">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      {group.county}
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                      {group.cities.map((city) => (
                        <li
                          key={city}
                          className="rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground"
                        >
                          {city}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* Vertical FAQ */}
      <section className="py-14 sm:py-20 bg-secondary/20 border-t border-border">
        <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              Questions realtors ask us
            </h2>
          </div>
          <Reveal className="space-y-4">
            {vertical.faq.map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-border bg-card p-5"
              >
                <h3 className="text-base font-semibold mb-2">{item.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </Reveal>
          <div className="text-center mt-10">
            <Button
              onClick={() => navigate("/demo")}
              size="lg"
              className="px-8 py-6 text-base font-semibold rounded-xl"
            >
              Try it free on your own website
            </Button>
          </div>
        </div>
      </section>

      <Footer />
      <AssistantErrorBoundary>
        <GeminiAgentWidget floating />
      </AssistantErrorBoundary>
    </div>
  );
};

export default AgentLandingTemplate;
