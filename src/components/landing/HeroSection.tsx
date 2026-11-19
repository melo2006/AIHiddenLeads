import { useCallback } from "react";
import { motion } from "framer-motion";
import { Phone, Search, Star, Users, Video, Calendar, ArrowRight, MessageSquare } from "lucide-react";
import { homepageSalesCopy } from "@/data/homepageSalesCopy";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { NicheData } from "@/data/nicheData";
import aspenPortrait from "@/assets/aspen-idle-wave.gif";
import HeroSceneSlider from "@/components/landing/HeroSceneSlider";

interface HeroSectionProps {
  niche: NicheData;
  onGetDemo: () => void;
}

const HeroSection = ({ niche, onGetDemo }: HeroSectionProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const copy = homepageSalesCopy(i18n.language);
  // One icon per hero service, in list order; positions past the array
  // fall back to Phone (the same fallback social/website used before).
  const icons = [Phone, Users, Search, Star, Video, Phone, MessageSquare, Phone];
  const openAspen = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-homepage-aspen', { detail: { mode: 'voice', start: true } }));
  }, []);

  return (
    <section className="landing-hero relative overflow-hidden pb-8 sm:pb-10">
      <div className="container mx-auto px-5 sm:px-6 relative z-10">
        {/* Badge — sits above the hero slider on the solid background.
            Top spacing stays tight: it comes from index.css
            (.landing-page > .landing-hero), since the navbar spacer owns
            the header offset — the pill + slider sit up close under the
            header, never clipped by it at scroll 0. */}
        <div className="text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-full border border-primary/20 bg-primary/5 mb-3 sm:mb-4"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-xs sm:text-base font-medium text-primary">
              {copy.badge}
            </span>
          </motion.div>
        </div>

        {/* Hero slider — photo band with the rotating slogan (the page
            h1) overlaid on each slide, realtor-slideshow format: arrows,
            dots, pause/play, swipe. Everything else lives below it. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
        >
          <HeroSceneSlider lines={copy.heroHeadlines} />
        </motion.div>

        {/* Two-column layout: Text left, Aspen right */}
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-10 mt-6 sm:mt-8">
          {/* Left column - Main content */}
          <div className="min-w-0 w-full flex-1 text-center lg:text-left">
            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-6"
            >
              {copy.heroSub}
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex w-full min-w-0 flex-col sm:flex-row sm:flex-wrap gap-3 justify-center lg:justify-start mb-5"
            >
              <Button
                onClick={() => navigate("/demo")}
                size="lg"
                className="h-auto min-h-12 max-w-full whitespace-normal break-words text-base sm:text-lg px-4 py-3 bg-primary text-primary-foreground hover:bg-primary/90 glow-border rounded-xl font-semibold"
              >
                {i18n.language.startsWith('en') ? 'Try it on your website — free' : copy.demo}
              </Button>
              <Button
                onClick={() => navigate('/book')}
                variant="outline"
                size="sm"
                className="h-auto whitespace-normal px-3.5 py-2 text-sm font-medium bg-background/60 shadow-sm backdrop-blur-sm hover:bg-background/85"
              >
                <Calendar className="h-4 w-4 shrink-0" />{t("cta.bookCall")}
              </Button>
              <Button onClick={() => navigate('/plans?plan=essentials')} variant="outline" size="sm" className="h-auto whitespace-normal px-3.5 py-2 text-sm font-medium bg-background/60 shadow-sm backdrop-blur-sm hover:bg-background/85"><ArrowRight className="h-4 w-4 shrink-0" />{t("cta.startNow")}</Button>
            </motion.div>

            {i18n.language.startsWith('en') && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.35 }}
                className="text-sm font-medium text-foreground max-w-xl mx-auto lg:mx-0 mb-5"
              >
                See your own website come alive in about 2 minutes. No signup, no card.
              </motion.p>
            )}

            {/* Trust line */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mb-8"
            >
              <p className="text-base sm:text-lg font-bold text-foreground max-w-xl mx-auto lg:mx-0">
                {copy.trust}
              </p>
              <button
                type="button"
                onClick={openAspen}
                className="mt-2 text-sm sm:text-base font-semibold text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80 hover:decoration-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"
              >
                {t("hero.askAspen")}
              </button>
            </motion.div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 text-left" aria-label={copy.title}>
              {copy.services.map((service, index) => {
                const Icon = icons[index] || Phone;
                return <li key={service.id} className="flex min-w-0 items-center gap-3">
                  <Icon className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-base font-semibold">{service.name}</span>
                </li>;
              })}
            </ul>
          </div>

          {/* Right column - Aspen with quote */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex-shrink-0 w-full lg:w-[420px] flex flex-col items-center"
          >
            <div className="relative">
              <button
                type="button"
                aria-label="Talk to Aspen"
                onClick={openAspen}
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
                onClick={(event) => { event.stopPropagation(); navigate("/demo"); }}
                className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {i18n.language.startsWith('en') ? 'Try it on your website — free' : copy.demo}
              </button>
            </div>
            {i18n.language.startsWith('en') && <p className="mt-3 text-center text-xs text-muted-foreground">Aspen, live on this page — tap to talk</p>}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
