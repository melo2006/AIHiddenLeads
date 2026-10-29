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
      "Natural neural voice — live two-way conversation, not robotic text-to-speech",
      "AI Chat Widget on your website",
      "Lead capture & appointment booking",
      "400 browser voice minutes/mo (≈ $0.25/min value)",
      "50 qualified B2B leads/month (weekly batches)",
      "Email lead notifications",
      "Basic analytics dashboard",
    ],
    growth: [
      "Everything in Natural Voice",
      "1,200 browser voice minutes/mo (≈ $0.17/min value)",
      "100 qualified B2B leads/month",
      "Database Reactivation (revive old leads)",
      "Automated email campaigns & drip sequences",
      "Speed-to-Lead follow-up",
      "Google review management",
      "CRM pipeline & tracking",
    ],
    full: [
      "Everything in Pro",
      "2,500 browser voice minutes/mo (≈ $0.14/min value)",
      "200 qualified B2B leads/month",
      "Social media content & posting",
      "Website refresh included",
      "Priority support",
      "Dedicated account manager",
      "White-label reporting",
    ],
  },
  "pt-BR": {
    essentials: [
      "Agente de Voz com IA (recepcionista 24/7)",
      "Chat de IA no seu site",
      "Captura de leads e agendamento automático",
      "400 minutos de voz no site/mês (≈ US$ 0,25/min)",
      "50 leads B2B qualificados por mês (lotes semanais)",
      "Notificação de lead por e-mail",
      "Painel básico de análises",
    ],
    growth: [
      "Tudo do Voz Natural",
      "1.200 minutos de voz no site/mês (≈ US$ 0,17/min)",
      "100 leads B2B qualificados por mês",
      "Reativação de Base (recupera leads antigos)",
      "Campanhas automáticas de e-mail e follow-up",
      "Speed-to-Lead (retorno rápido por IA)",
      "Gestão de avaliações no Google",
      "Pipeline e acompanhamento no CRM",
    ],
    full: [
      "Tudo do Pro",
      "2.500 minutos de voz no site/mês (≈ US$ 0,14/min)",
      "200 leads B2B qualificados por mês",
      "Conteúdo e posts em redes sociais",
      "Refresh do site incluído",
      "Suporte prioritário",
      "Gerente de conta dedicado",
      "Relatórios white-label",
    ],
  },
  es: {
    essentials: [
      "Agente de Voz con IA (recepcionista 24/7)",
      "Chat de IA en tu sitio",
      "Captura de leads y agendamiento",
      "400 minutos de voz web/mes (≈ $0.25/min)",
      "50 leads B2B calificados al mes (lotes semanales)",
      "Notificación de leads por correo",
      "Panel básico de analítica",
    ],
    growth: [
      "Todo lo de Voz Natural",
      "1,200 minutos de voz web/mes (≈ $0.17/min)",
      "100 leads B2B calificados al mes",
      "Reactivación de Base (recupera leads viejos)",
      "Campañas automáticas de correo y seguimiento",
      "Speed-to-Lead (respuesta rápida con IA)",
      "Gestión de reseñas de Google",
      "Pipeline y seguimiento en CRM",
    ],
    full: [
      "Todo lo del Pro",
      "2,500 minutos de voz web/mes (≈ $0.14/min)",
      "200 leads B2B calificados al mes",
      "Contenido y publicaciones en redes",
      "Refresh del sitio incluido",
      "Soporte prioritario",
      "Gerente de cuenta dedicado",
      "Reportes white-label",
    ],
  },
};

const PricingSection = ({ recommendedPlan }: { recommendedPlan?: string } = {}) => {
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
                id={`plan-${tier.checkoutPlan}`}
                key={tier.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative scroll-mt-6 rounded-2xl border p-6 sm:p-8 flex flex-col ${recommendedPlan === tier.checkoutPlan ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''} ${
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
                    </>
                  )}
                  <p className="text-xs text-primary font-medium mt-2">
                    {tier.minutes.toLocaleString()} {t("pricing.webMinutes")} (≈ ${tier.perMin}{t("pricing.perMinSuffix")})
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("pricing.promoMinutes", { n: tier.normalMinutes.toLocaleString() })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("pricing.setup")} <span className="line-through">${tier.originalSetup}</span>{" "}
                    <span className="text-primary font-semibold">{t("pricing.free")}</span>{" "}
                    <span className="text-muted-foreground">{t("pricing.setupPromo")}</span>
                  </p>
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

          <div className="rounded-xl border border-border bg-card/50 p-5">
            <p className="text-sm text-center text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">{t("pricing.telephonyTitle")}</span>{" "}
              <Trans i18nKey="pricing.telephonyBody" components={{ strong: <span className="text-primary font-medium" /> }} />
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card/50 p-5">
            <p className="text-sm text-center text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Live video avatar add-on: $79/mo.</span>{" "}
              Includes <span className="text-primary font-medium">400 video avatar minutes</span> on Natural Voice. Pick any face from our avatar library <span className="text-primary font-medium">free</span>, or have a custom avatar built from your own photo for a <span className="text-primary font-medium">$50 one-time fee</span>. Custom faces can take several minutes up to about 24 hours to build.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default PricingSection;
