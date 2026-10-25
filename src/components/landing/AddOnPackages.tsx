import { motion } from "framer-motion";
import { Globe, Search, Sparkles, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { searchGrowthOffers, searchBundleSavings } from "@/lib/homepageMapComparison";

const addOns = [
  {
    key: "websiteRefresh",
    icon: Wrench,
    price: "$99",
    priceBRL: "R$ 499",
  },
  {
    key: "seoAudit",
    icon: Search,
    price: "FREE",
    priceBRL: "GRÁTIS",
  },
  {
    key: "aiSearch",
    icon: Sparkles,
    price: `$${searchGrowthOffers.aiSearch}`,
    priceBRL: "R$ 1.249",
    priceNote: "/mo",
    badgeKey: "liveNow",
  },
  {
    key: "mapsBoost",
    icon: Globe,
    price: `$${searchGrowthOffers.mapsBoost}`,
    priceBRL: "R$ 749",
    priceNote: "/mo",
  },
];

const AddOnPackages = () => {
  const { t, i18n } = useTranslation();
  const isPT = i18n.language === "pt-BR";
  const scrollToDemo = () => {
    document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-16 sm:py-20 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
            {t("addons.badge")}
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t("addons.title")} <span className="text-gradient-primary">{t("addons.titleAccent")}</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("addons.sub")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {addOns.map((addon, i) => (
            <motion.div
              key={addon.key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group rounded-2xl border border-border bg-card p-6 flex flex-col hover:border-primary/30 transition-all duration-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <addon.icon className="w-5 h-5 text-primary" />
                </div>
                {addon.badgeKey && (
                    <Badge variant="outline" className="max-w-full whitespace-normal border-primary/30 text-primary text-[10px] px-2 py-0.5">
                    {t(`addons.${addon.badgeKey}`)}
                  </Badge>
                )}
              </div>

              <h3 className="text-lg font-semibold mb-1">{t(`addons.items.${addon.key}.title`)}</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-2xl font-extrabold text-primary">{isPT ? addon.priceBRL : addon.price}</span>
                {addon.priceNote && (
                  <span className="text-sm text-muted-foreground">{t("pricing.perMo")}</span>
                )}
              </div>
              {isPT && addon.price !== "FREE" && (
                <p className="text-[11px] text-muted-foreground mb-3">(≈ {addon.price} USD{addon.priceNote ? t("pricing.perMo") : ""})</p>
              )}

              <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-4">
                {t(`addons.items.${addon.key}.description`)}
              </p>

              <p className="text-xs text-muted-foreground italic mb-4">{t(`addons.items.${addon.key}.note`)}</p>

              <Button
                onClick={scrollToDemo}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {t("addons.learnMore")}
              </Button>
            </motion.div>
          ))}
        </div>

        <div className="mx-auto mt-6 max-w-5xl border-y border-primary/40 bg-primary/10 px-5 py-7 sm:px-8">
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">{t("addons.bundle.badge")}</Badge>
          <h3 className="text-xl font-bold sm:text-2xl">{t("addons.bundle.title")}</h3>
          <p className="mt-3 text-base leading-relaxed">{t("addons.bundle.body", { maps: searchGrowthOffers.mapsBoost, ai: searchGrowthOffers.aiSearch, bundle: searchGrowthOffers.bundle, savings: searchBundleSavings })}</p>
          <p className="mt-3 text-xs text-muted-foreground">{t("addons.bundle.note")}</p>
        </div>

        {/* AI Search teaser */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-8 max-w-3xl mx-auto"
        >
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 text-center">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">{t("addons.futureTitle")}</span>{" "}
              {t("addons.futureBody")}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default AddOnPackages;
