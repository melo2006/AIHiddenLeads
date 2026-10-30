import { motion } from "framer-motion";
import { Phone, Search, Star, Users, Video, Calendar, ArrowRight } from "lucide-react";
import { homepageSalesCopy } from "@/data/homepageSalesCopy";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { NicheData } from "@/data/nicheData";
import AspenWindowPreview from './AspenWindowPreview';

interface HeroSectionProps {
  niche: NicheData;
  onGetDemo: () => void;
}

const HeroSection = ({ niche, onGetDemo }: HeroSectionProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const copy = homepageSalesCopy(i18n.language);
  const icons = [Phone, Users, Search, Star, Video];

  return (
    <section className="landing-hero relative overflow-hidden pt-6 sm:pt-8 pb-8 sm:pb-10">
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
                {copy.badge}
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-5"
            >
              <span className="text-foreground">{copy.headline}</span>
              <br />
              <span className="text-primary">{copy.headlineAccent}</span>
              
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-6"
            >
              {copy.sub}
              <span className="mt-3 block font-semibold text-foreground">{copy.start}</span>
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
                {copy.demo}
              </Button>
              <Button
                onClick={() => navigate('/book')}
                variant="outline"
                size="lg"
                className="h-auto min-h-12 max-w-full whitespace-normal break-words text-base sm:text-lg px-4 py-3 border-border hover:bg-secondary rounded-xl"
              >
                <Calendar className="h-4 w-4 shrink-0" />{i18n.language === 'pt-BR' ? 'Agende uma conversa' : i18n.language === 'es' ? 'Reserva una llamada' : 'Book a quick call'}
              </Button>
              <Button onClick={() => navigate('/plans?plan=essentials')} variant="outline" size="lg" className="h-auto min-h-12 whitespace-normal px-4 py-3"><ArrowRight className="h-4 w-4 shrink-0" />{i18n.language === 'pt-BR' ? 'Comece agora' : i18n.language === 'es' ? 'Empieza ahora' : 'Start now'}</Button>
            </motion.div>

            {/* Trust line */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="text-sm sm:text-base text-muted-foreground mb-8"
            >
              {copy.trust}
              <span className="mt-2 block">{i18n.language.startsWith('pt') ? 'Dúvidas? Converse com Aspen por voz ou chat.' : i18n.language.startsWith('es') ? '¿Preguntas? Habla con Aspen por voz o chat.' : 'Questions? Talk to Aspen by voice or chat.'}</span>
            </motion.p>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 text-left" aria-label={copy.title}>
              {copy.services.map((service, index) => {
                const Icon = icons[index] || Phone;
                return <li key={service.id} className="flex min-w-0 items-center gap-3">
                  <Icon className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm font-medium">{service.name}</span>
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
            <AspenWindowPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
