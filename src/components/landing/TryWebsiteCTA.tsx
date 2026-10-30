import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

const TryWebsiteCTA = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="landing-demo-invitation py-4 sm:py-5 border-y border-primary/20 bg-primary/5">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="relative py-3 text-center overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">{t("tryCta.kicker")}</span>
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
              {t("tryCta.title")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-4">
              {t("tryCta.sub")}
            </p>
            <Button
              onClick={() => navigate("/demo")}
              size="lg"
              className="px-8 py-6 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 glow-border rounded-xl"
            >
              {t("tryCta.cta")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TryWebsiteCTA;

