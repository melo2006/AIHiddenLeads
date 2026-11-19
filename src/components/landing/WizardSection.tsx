import { motion } from "framer-motion";
import { ArrowRight, Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import alexPoster from "@/assets/team/alex-poster.png";
import wizardStep1 from "@/assets/wizard/wizard-step1-business.webp";
import wizardStep2 from "@/assets/wizard/wizard-step2-learn.webp";
import wizardStep3 from "@/assets/wizard/wizard-step3-face.webp";

// "Build it yourself, with Alex" — the setup-wizard showcase (Ron's
// direction, 2026-11-18): a large 16:9 Alex frame as the visual anchor,
// the wizard's six real steps as a numbered rail, and REAL captures of
// the shipped wizard (src/assets/wizard/*, rendered from the production
// wizard build with a sample plumbing business — never mockups).

const stepKeys = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

const WizardSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const shots = [
    { src: wizardStep1, alt: t("wizardSection.shot1Alt"), caption: t("wizardSection.shot1Caption") },
    { src: wizardStep2, alt: t("wizardSection.shot2Alt"), caption: t("wizardSection.shot2Caption") },
    { src: wizardStep3, alt: t("wizardSection.shot3Alt"), caption: t("wizardSection.shot3Caption") },
  ];

  return (
    <section id="setup-wizard" className="border-y border-border bg-secondary/30 py-14 sm:py-20 relative">
      <div className="container mx-auto px-5 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10 sm:mb-14"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            {t("wizardSection.title1")}{" "}
            <span className="text-gradient-primary">{t("wizardSection.title2")}</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
            {t("wizardSection.sub")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 max-w-6xl mx-auto items-start">
          {/* Alex — the large 16:9 frame, the section's visual anchor.
              VIDEO SWAP POINT: when the wizard walkthrough tutorial is
              filmed, replace the <img> in this frame with the video
              player (<video> or embed) — the frame is already the
              player's 16:9 box, so the swap is a one-line change and
              the layout does not move. No play button until then:
              nothing on this page pretends to be a control it isn't. */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-7"
          >
            <div className="relative aspect-video overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-card to-accent/15 shadow-xl">
              <img
                src={alexPoster}
                alt={t("wizardSection.alexAlt")}
                className="absolute right-0 top-0 h-full w-auto max-w-none"
                loading="lazy"
              />
              <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-card/85 via-card/40 to-transparent" />
              <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
                <Clock3 className="h-3.5 w-3.5 text-primary" />
                {t("wizardSection.timeChip")}
              </span>
              <div className="absolute bottom-4 left-4 right-4 sm:right-auto max-w-[75%] rounded-2xl bg-background/85 px-4 py-3 backdrop-blur">
                <p className="font-semibold leading-tight">
                  {t("wizardSection.alexName")} ·{" "}
                  <span className="text-primary">{t("wizardSection.alexRole")}</span>
                </p>
                <p className="text-sm text-muted-foreground leading-snug mt-0.5">
                  {t("wizardSection.alexLine")}
                </p>
              </div>
            </div>
          </motion.div>

          {/* The six steps — a clean numbered rail beside the frame. */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-5"
          >
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-5">
              {t("wizardSection.stepsTitle")}
            </h3>
            <ol className="relative space-y-5">
              <span aria-hidden className="absolute left-[17px] top-2 bottom-2 w-px bg-border" />
              {stepKeys.map((key, i) => (
                <li key={key} className="relative flex gap-4">
                  <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className="font-semibold leading-tight">{t(`wizardSection.${key}.title`)}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                      {t(`wizardSection.${key}.desc`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </motion.div>
        </div>

        {/* Real wizard screens */}
        <div className="max-w-6xl mx-auto mt-10 sm:mt-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {shots.map((shot, i) => (
              <motion.figure
                key={shot.caption}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-md"
              >
                <img src={shot.src} alt={shot.alt} className="w-full h-auto block" loading="lazy" />
                <figcaption className="px-4 py-2.5 text-sm font-medium border-t border-border">
                  {shot.caption}
                </figcaption>
              </motion.figure>
            ))}
          </div>
          <p className="text-center text-xs sm:text-sm text-muted-foreground mt-4">
            {t("wizardSection.shotsNote")}
          </p>
        </div>

        <div className="text-center mt-10">
          <Button size="lg" className="h-auto min-h-11 whitespace-normal" onClick={() => navigate("/plans")}>
            {t("wizardSection.cta")}
            <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
          </Button>
          <p className="text-sm text-muted-foreground mt-3">{t("wizardSection.ctaNote")}</p>
          <Button asChild variant="link" className="h-auto whitespace-normal px-0 mt-1">
            <Link to="/demo">{t("wizardSection.demoLink")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default WizardSection;
