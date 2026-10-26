import { motion } from "framer-motion";
import { Phone, PhoneOff, Zap, TrendingUp, MessageCircle } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { NicheData } from "@/data/nicheData";
import aspenHero from "@/assets/aspen-hero.jpg";
import AspenWindowPreview from './AspenWindowPreview';

interface HeroSectionProps {
  niche: NicheData;
  onGetDemo: () => void;
}

const HeroSection = ({ niche, onGetDemo }: HeroSectionProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden pt-20 sm:pt-24 pb-8 sm:pb-10">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_70%)]" />
      </div>

      <div className="container mx-auto px-5 sm:px-6 relative z-10">
        {/* Two-column layout: Text left, Aspen right */}
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-10">
          {/* Left column - Main content */}
          <div className="min-w-0 w-full flex-1 text-center lg:text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-full border border-primary/20 bg-primary/5 mb-4 sm:mb-5"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-xs sm:text-base font-medium text-primary">
                {t("hero.badge")}
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-5"
            >
              <span className="text-foreground">{t("hero.headline1")}</span>
              <br />
              <span className="text-gradient-primary glow-text">{t("hero.headline2")}</span>
              <br />
              <span className="text-foreground text-xl sm:text-3xl lg:text-4xl">{t("hero.headline3")}</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-6"
            >
              {t("hero.sub")}
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
                {t("hero.ctaPrimary")}
              </Button>
              <Button
                onClick={onGetDemo}
                variant="outline"
                size="lg"
                className="h-auto min-h-12 max-w-full whitespace-normal break-words text-base sm:text-lg px-4 py-3 border-border hover:bg-secondary rounded-xl"
              >
                {t("hero.ctaSecondary")}
              </Button>
            </motion.div>

            {/* Trust line */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="text-sm sm:text-base text-muted-foreground mb-8"
            >
              {t("hero.trust")}
            </motion.p>

            {/* Stats - 2x2 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:gap-4 max-w-md mx-auto lg:mx-0 [&>div]:min-w-0 [&>div]:flex-wrap"
            >
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5">
                <PhoneOff className="w-5 h-5 text-destructive shrink-0" />
                <div className="text-left">
                  <p className="text-xl sm:text-2xl font-bold text-destructive">78%</p>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{t("hero.stat1")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-xl border border-primary/30 bg-primary/5">
                <Phone className="w-5 h-5 text-primary shrink-0" />
                <div className="text-left">
                  <p className="text-xl sm:text-2xl font-bold text-primary">27%</p>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{t("hero.stat2")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-xl border border-accent/30 bg-accent/5">
                <TrendingUp className="w-5 h-5 text-accent shrink-0" />
                <div className="text-left">
                  <p className="text-xl sm:text-2xl font-bold text-accent">$1,200</p>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{t("hero.stat3")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-xl border border-primary/30 bg-primary/5">
                <Zap className="w-5 h-5 text-primary shrink-0" />
                <div className="text-left">
                  <p className="text-xl sm:text-2xl font-bold text-primary">97%</p>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{t("hero.stat4")}</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right column - Aspen with quote */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex-shrink-0 w-full lg:w-[420px] flex flex-col items-center"
          >
            <AspenWindowPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
