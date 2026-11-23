import { motion } from "framer-motion";
import { Search, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Paid ranking tiers (Google Maps Boost / AI Search Optimization / bundle)
// were pulled on 2026-11-23 by Ron's decision: the free 25-point audit
// stays; visibility help is delivered as a concierge engagement, not a
// purchasable tier, until that delivery is built and proven.
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
];

const AddOnPackages = () => {
  const { t, i18n } = useTranslation();
  const isPT = i18n.language === "pt-BR";
  const scrollToDemo = () => {
    document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="addons" className="py-16 sm:py-20 relative">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
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
              </div>

              <h3 className="text-lg font-semibold mb-1">{t(`addons.items.${addon.key}.title`)}</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-2xl font-extrabold text-primary">{isPT ? addon.priceBRL : addon.price}</span>
              </div>
              {isPT && addon.price !== "FREE" && (
                <p className="text-[11px] text-muted-foreground mb-3">(≈ {addon.price} USD)</p>
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

      </div>
    </section>
  );
};

export default AddOnPackages;
