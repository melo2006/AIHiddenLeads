import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { NicheData } from "@/data/nicheData";

// Realtors
import oldPhoneRealtors from "@/assets/old-website-phone.png";
import newPhoneRealtors from "@/assets/new-website-phone-aspen.jpg";
import oldLaptopRealtors from "@/assets/old-website-laptop.png";
import newLaptopRealtors from "@/assets/new-website-laptop-aspen.jpg";

// Med Spas
import oldPhoneMedspa from "@/assets/old-medspa-phone.png";
import newPhoneMedspa from "@/assets/new-medspa-phone.png";
import oldLaptopMedspa from "@/assets/old-medspa-laptop.png";
import newLaptopMedspa from "@/assets/new-medspa-laptop.png";

// Auto Detailing
import oldPhoneAuto from "@/assets/old-autodetail-phone.png";
import newPhoneAuto from "@/assets/new-autodetail-phone.png";
import oldLaptopAuto from "@/assets/old-autodetail-laptop.png";
import newLaptopAuto from "@/assets/new-autodetail-laptop.png";

// Vet Clinics
import oldPhoneVet from "@/assets/old-vet-phone.png";
import newPhoneVet from "@/assets/new-vet-phone.png";
import oldLaptopVet from "@/assets/old-vet-laptop.png";
import newLaptopVet from "@/assets/new-vet-laptop.png";

// Marine Services
import oldPhoneMarine from "@/assets/old-marine-phone.png";
import newPhoneMarine from "@/assets/new-marine-phone.png";
import oldLaptopMarine from "@/assets/old-marine-laptop.png";
import newLaptopMarine from "@/assets/new-marine-laptop.png";

interface NicheAssets {
  oldPhone: string;
  newPhone: string;
  oldLaptop: string;
  newLaptop: string;
}

const nicheAssets: Record<string, NicheAssets> = {
  realtors: {
    oldPhone: oldPhoneRealtors,
    newPhone: newPhoneRealtors,
    oldLaptop: oldLaptopRealtors,
    newLaptop: newLaptopRealtors,
  },
  medspa: {
    oldPhone: oldPhoneMedspa,
    newPhone: newPhoneMedspa,
    oldLaptop: oldLaptopMedspa,
    newLaptop: newLaptopMedspa,
  },
  autodetail: {
    oldPhone: oldPhoneAuto,
    newPhone: newPhoneAuto,
    oldLaptop: oldLaptopAuto,
    newLaptop: newLaptopAuto,
  },
  veterinary: {
    oldPhone: oldPhoneVet,
    newPhone: newPhoneVet,
    oldLaptop: oldLaptopVet,
    newLaptop: newLaptopVet,
  },
  marine: {
    oldPhone: oldPhoneMarine,
    newPhone: newPhoneMarine,
    oldLaptop: oldLaptopMarine,
    newLaptop: newLaptopMarine,
  },
};

interface BeforeAfterSectionProps {
  niche: NicheData;
}

const BeforeAfterSection = ({ niche }: BeforeAfterSectionProps) => {
  const { t } = useTranslation();
  const assets = nicheAssets[niche.id] ?? nicheAssets.realtors;

  const scrollToDemo = () => {
    document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-14 sm:py-20 overflow-hidden">
      <div className="container mx-auto px-5 sm:px-6">
        <motion.div
          key={niche.id + "-header"}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-12"
        >
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold mb-3">
            <span className="text-foreground">{t("beforeAfter.titleStart")} </span>
            <span className="text-destructive">{t("beforeAfter.outdated")}</span>
            <span className="text-foreground"> {t("beforeAfter.to")} </span>
            <span className="text-gradient-primary">{t("beforeAfter.aiPowered")}</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-lg max-w-2xl mx-auto">
            {t(`beforeAfter.niches.${niche.id}.subtitle`)}
          </p>
        </motion.div>

        {/* Phone mockups */}
        <div className="flex flex-row items-center justify-center gap-4 sm:gap-8 lg:gap-12 max-w-4xl mx-auto">
          <motion.div
            key={niche.id + "-old-phone"}
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative flex-1 max-w-[200px] sm:max-w-[260px]"
          >
            <div className="absolute -inset-2 rounded-3xl bg-destructive/10 blur-xl" />
            <div className="relative">
              <img src={assets.oldPhone} alt={`Outdated ${niche.label} website on a phone`} className="w-full h-auto rounded-2xl" />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-destructive/20 border border-destructive/30 text-destructive text-xs sm:text-sm font-semibold whitespace-nowrap">
                {t(`beforeAfter.niches.${niche.id}.before`)}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="flex-shrink-0 hidden sm:flex"
          >
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-primary" />
            </div>
          </motion.div>

          <motion.div
            key={niche.id + "-new-phone"}
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative flex-1 max-w-[220px] sm:max-w-[290px]"
          >
            <div className="absolute -inset-2 rounded-3xl bg-primary/10 blur-xl" />
            <div className="relative overflow-hidden rounded-2xl">
              <img src={assets.newPhone} alt={`Modern AI-powered ${niche.label} website`} className="w-full h-auto" />
            </div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs sm:text-sm font-semibold whitespace-nowrap">
              {t("beforeAfter.after")}
            </div>
          </motion.div>
        </div>

        {/* Laptop mockups */}
        <div className="flex flex-row items-center justify-center gap-4 sm:gap-8 lg:gap-12 max-w-5xl mx-auto mt-12 sm:mt-16">
          <motion.div
            key={niche.id + "-old-laptop"}
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative flex-1 max-w-[280px] sm:max-w-[380px]"
          >
            <div className="absolute -inset-2 rounded-3xl bg-destructive/10 blur-xl" />
            <div className="relative">
              <img src={assets.oldLaptop} alt={`Outdated ${niche.label} website on a laptop`} className="w-full h-auto rounded-xl" />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-destructive/20 border border-destructive/30 text-destructive text-xs sm:text-sm font-semibold whitespace-nowrap">
                {t("beforeAfter.desktopBefore")}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="flex-shrink-0 hidden sm:flex"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-primary" />
            </div>
          </motion.div>

          <motion.div
            key={niche.id + "-new-laptop"}
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative flex-1 max-w-[280px] sm:max-w-[380px]"
          >
            <div className="absolute -inset-2 rounded-3xl bg-primary/10 blur-xl" />
            <div className="relative overflow-hidden rounded-xl">
              <img src={assets.newLaptop} alt={`Modern AI-powered ${niche.label} website on a laptop`} className="w-full h-auto" />
            </div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs sm:text-sm font-semibold whitespace-nowrap">
              {t("beforeAfter.desktopAfter")}
            </div>
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-12"
        >
          <Button
            onClick={scrollToDemo}
            size="lg"
            className="text-base sm:text-lg px-8 py-5 bg-primary text-primary-foreground hover:bg-primary/90 glow-border rounded-xl font-semibold"
          >
            {t("beforeAfter.cta")}
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default BeforeAfterSection;
