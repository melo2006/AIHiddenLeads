import { motion } from "framer-motion";
import { Check, Sparkles, Zap, Crown, Info } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

const tiers = [
  {
    key: "essentials",
    price: 99,
    priceBRL: 499,
    originalPrice: 199,
    originalPriceBRL: 999,
    setupFee: 99,
    setupFeeBRL: 499,
    originalSetup: 99,
    originalSetupBRL: 499,
    icon: Zap,
    popular: false,
    checkoutPlan: "essentials",
    featureCount: 7,
    minutes: 400,
    normalMinutes: 200,
    perMin: "0.25",
    leads: 50,
  },
  {
    key: "growth",
    price: 199,
    priceBRL: 999,
    originalPrice: 399,
    originalPriceBRL: 1999,
    setupFee: 199,
    setupFeeBRL: 999,
    originalSetup: 199,
    originalSetupBRL: 999,
    icon: Sparkles,
    popular: true,
    checkoutPlan: "growth",
    featureCount: 8,
    minutes: 1200,
    normalMinutes: 600,
    perMin: "0.17",
    leads: 100,
  },
  {
    key: "full",
    price: 349,
    priceBRL: 1749,
    originalPrice: 699,
    originalPriceBRL: 3499,
    setupFee: null,
    setupFeeBRL: null,
    originalSetup: 349,
    originalSetupBRL: 1749,
    icon: Crown,
    popular: false,
    checkoutPlan: "fullservice",
    featureCount: 8,
    minutes: 2500,
    normalMinutes: 1250,
    perMin: "0.14",
    leads: 200,
  },
] as const;

// Static feature lists by language are kept inline here as fallback English (keeps payload simple).
// They're tier-specific operational features we don't translate per-character — using i18n.exists pattern.
const FEATURES: Record<string, Record<string, string[]>> = {
  en: {
    essentials: [
      "AI Voice Agent (24/7 receptionist)",
      "AI Chat Widget on your website",
      "Lead capture & appointment booking",
      "Warm transfer hot leads to your phone",
      "Up to 100 AI interactions/mo",
      "Email & SMS lead notifications",
      "Basic analytics dashboard",
    ],
    growth: [
      "Everything in AI Essentials",
      "Database Reactivation (revive old leads)",
      "50 new leads/month from prospecting",
      "Automated Email & SMS campaigns",
      "Drip sequences (days/weeks of follow-up)",
      "Google Review management",
      "Speed-to-Lead (60-sec AI callback)",
      "CRM pipeline & tracking",
    ],
    full: [
      "Everything in Growth Engine",
      "Unlimited lead generation",
      "Unlimited outreach campaigns",
      "Social media content & posting",
      "Website refresh included",
      "Priority AI voice minutes",
      "Dedicated account manager",
      "White-label reporting",
    ],
  },
  "pt-BR": {
    essentials: [
      "Agente de Voz com IA (recepcionista 24/7)",
      "Chat WhatsApp com IA (texto + áudios)",
      "Chat de IA no seu site",
      "Captura de leads e agendamento automático",
      "Transferência ao vivo dos leads quentes",
      "Até 500 conversas de IA por mês",
      "Notificação de lead por e-mail e SMS",
    ],
    growth: [
      "Tudo do IA Essencial",
      "WhatsApp IA ilimitado (texto + áudio)",
      "Reativação de Base (recupera leads antigos)",
      "50 leads novos por mês via prospecção",
      "Campanhas automáticas de WhatsApp, e-mail e SMS",
      "Sequências de follow-up (dias/semanas)",
      "Gestão de avaliações no Google",
      "Speed-to-Lead (retorno em 60s por IA)",
    ],
    full: [
      "Tudo do Motor de Crescimento",
      "WhatsApp + Voz IA ilimitados",
      "Geração de leads ilimitada",
      "Campanhas de prospecção ilimitadas",
      "Conteúdo e posts em redes sociais",
      "Refresh do site incluído",
      "Gerente de conta dedicado",
      "Relatórios white-label",
    ],
  },
  es: {
    essentials: [
      "Agente de Voz con IA (recepcionista 24/7)",
      "Chat de IA en tu sitio",
      "Captura de leads y agendamiento",
      "Transferencia en vivo de leads calientes",
      "Hasta 100 interacciones de IA al mes",
      "Notificación de leads por correo y SMS",
      "Panel básico de analítica",
    ],
    growth: [
      "Todo lo de IA Esencial",
      "Reactivación de Base (recupera leads viejos)",
      "50 leads nuevos al mes desde prospección",
      "Campañas automáticas de correo y SMS",
      "Secuencias de seguimiento (días/semanas)",
      "Gestión de reseñas de Google",
      "Speed-to-Lead (devolución de llamada en 60s)",
      "Pipeline y seguimiento en CRM",
    ],
    full: [
      "Todo lo del Motor de Crecimiento",
      "Generación de leads ilimitada",
      "Campañas de prospección ilimitadas",
      "Contenido y publicaciones en redes",
      "Refresh del sitio incluido",
      "Minutos de voz prioritarios",
      "Gerente de cuenta dedicado",
      "Reportes white-label",
    ],
  },
};

const PricingSection = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = (FEATURES[i18n.language] ? i18n.language : "en") as keyof typeof FEATURES;

  const handleCheckout = (plan: string) => {
    navigate(`/checkout?plan=${plan}`);
  };

  return (
    <section id="pricing" className="py-16 sm:py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
            {t("pricing.badge")}
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t("pricing.title")} <span className="text-gradient-primary">{t("pricing.titleAccent")}</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("pricing.sub")}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((tier, i) => {
            const features = FEATURES[lang][tier.key];
            return (
              <motion.div
                key={tier.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-2xl border p-6 sm:p-8 flex flex-col ${
                  tier.popular
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                    : "border-border bg-card"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground px-4 py-1 text-xs font-semibold">
                      {t("pricing.mostPopular")}
                    </Badge>
                  </div>
                )}

                <div className="mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                    <tier.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold">{t(`pricing.${tier.key}.name`)}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t(`pricing.${tier.key}.tag`)}</p>
                </div>

                <div className="mb-6">
                  {lang === "pt-BR" ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold">R$ {tier.priceBRL.toLocaleString("pt-BR")}</span>
                        <span className="text-muted-foreground text-sm">{t("pricing.perMo")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">(≈ ${tier.price} USD{t("pricing.perMo")})</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="line-through">R$ {tier.originalPriceBRL.toLocaleString("pt-BR")}{t("pricing.perMo")}</span>
                        <span className="text-primary ml-2 font-medium">{t("pricing.launchPrice")}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {tier.setupFeeBRL !== null ? (
                          <>
                            {t("pricing.setup")} <span className="line-through">R$ {tier.originalSetupBRL.toLocaleString("pt-BR")}</span>{" "}
                            <span className="text-primary font-semibold">R$ {tier.setupFeeBRL.toLocaleString("pt-BR")}</span>{" "}
                            <span className="text-muted-foreground">(≈ ${tier.setupFee} USD)</span>
                          </>
                        ) : (
                          <>
                            {t("pricing.setup")} <span className="line-through">R$ {tier.originalSetupBRL.toLocaleString("pt-BR")}</span>{" "}
                            <span className="text-primary font-semibold">{t("pricing.free")}</span>
                          </>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold">${tier.price}</span>
                        <span className="text-muted-foreground text-sm">{t("pricing.perMo")}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="line-through">${tier.originalPrice}{t("pricing.perMo")}</span>
                        <span className="text-primary ml-2 font-medium">{t("pricing.launchPrice")}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {tier.setupFee !== null ? (
                          <>
                            {t("pricing.setup")} <span className="line-through">${tier.originalSetup}</span>{" "}
                            <span className="text-primary font-semibold">${tier.setupFee}</span>
                          </>
                        ) : (
                          <>
                            {t("pricing.setup")} <span className="line-through">${tier.originalSetup}</span>{" "}
                            <span className="text-primary font-semibold">{t("pricing.free")}</span>
                          </>
                        )}
                      </p>
                    </>
                  )}
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleCheckout(tier.checkoutPlan)}
                  variant={tier.popular ? "default" : "outline"}
                  className="w-full"
                >
                  {t(`pricing.${tier.key}.cta`)}
                </Button>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-8 max-w-3xl mx-auto space-y-4"
        >
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  {t("pricing.transparencyTitle")}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <Trans i18nKey="pricing.transparencyBody" components={{ strong: <span className="text-foreground font-medium" /> }} />
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/50 p-5">
            <p className="text-sm text-center text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">{t("pricing.compareTitle")}</span>{" "}
              <Trans i18nKey="pricing.compareBody" components={{ strong: <span className="text-primary font-medium" /> }} />
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default PricingSection;
