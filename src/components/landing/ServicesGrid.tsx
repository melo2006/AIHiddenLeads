import { Phone, Users, MapPin, Star, Video, ArrowRight, Check, Megaphone, Globe, MonitorSmartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link, useNavigate } from "react-router-dom";
import { homepageSalesCopy } from "@/data/homepageSalesCopy";
import { SERVICE_DETAILS } from "@/data/serviceDetails";

const iconById: Record<string, typeof Phone> = { voice: Phone, video: MonitorSmartphone, leads: Users, b2c: Megaphone, search: MapPin, reputation: Star, social: Video, website: Globe };

// Detail-page copy (accordion bullets on the English cards, "Learn more" targets on
// every card) lives in serviceDetails; localized cards join to it by service id.
const detailById: Record<string, (typeof SERVICE_DETAILS)[number]> = Object.fromEntries(SERVICE_DETAILS.map((s) => [s.id, s]));

const ServicesGrid = () => {
  const { i18n, t } = useTranslation();
  const copy = homepageSalesCopy(i18n.language);
  const navigate = useNavigate();
  const english = !i18n.language || i18n.language.startsWith("en");
  return (
    <section id="services" className="border-y border-border py-12 sm:py-16">
      <div className="container mx-auto px-5 sm:px-6">
        <div className="max-w-3xl mb-8">
          <p className="text-xs font-semibold uppercase text-primary mb-3">AI Hidden Leads</p>
          <h2 className="text-2xl sm:text-4xl font-bold">{copy.title}</h2>
          <p className="mt-4 text-muted-foreground">{copy.description}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {english ? SERVICE_DETAILS.map((s, index) => {
            const Icon = iconById[s.id] || Phone;
            return <article key={s.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <Icon className="h-10 w-10 text-primary" aria-hidden="true" />
                <Badge variant="outline" className={s.status === "available" ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}>
                  {s.status === "available" ? t("landing.available") : t("landing.preOrder")}
                </Badge>
              </div>
              <p className="text-lg font-semibold leading-snug">{s.problem}</p>
              <p className="mt-2 text-sm text-muted-foreground">{s.today}</p>
              <p className="mt-4 text-xs font-medium uppercase text-primary">0{index + 1} · {s.name}</p>
              <p className="mt-1 text-sm leading-relaxed">{s.solution}</p>
              <Accordion type="single" collapsible className="mt-2">
                <AccordionItem value="more" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm text-primary">{t("landing.moreDetails")}</AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2">
                      {s.details.map((d) => <li key={d} className="flex gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />{d}</li>)}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <Button size="sm" className="h-auto min-h-9 whitespace-normal" onClick={() => navigate("/plans")}>
                  {s.status === "available" ? t("landing.getStarted") : t("landing.preOrder")}
                </Button>
                <Button size="sm" variant="ghost" asChild><Link to={`/services/${s.id}`}>{t("landing.learnMore")} <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
              </div>
            </article>;
          }) : copy.services.map((service, index) => {
            const Icon = iconById[service.id] || Phone;
            const detail = detailById[service.id];
            return <article key={service.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <Icon className="h-10 w-10 text-primary" aria-hidden="true" />
                {detail && <Badge variant="outline" className={detail.status === "available" ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}>
                  {detail.status === "available" ? t("landing.available") : t("landing.preOrder")}
                </Badge>}
              </div>
              {service.problem && <p className="text-lg font-semibold leading-snug">{service.problem}</p>}
              <p className="mt-4 text-xs font-medium uppercase text-primary">0{index + 1} · {service.name}</p>
              {service.solution
                ? <p className="mt-1 text-sm leading-relaxed">{service.solution}</p>
                : <ul className="mt-2 space-y-3">
                    {service.benefits.map(benefit => <li key={benefit} className="flex gap-2 text-sm text-muted-foreground leading-relaxed"><Check className="h-4 w-4 shrink-0 text-primary mt-1" />{benefit}</li>)}
                  </ul>}
              <p className="mt-2 text-xs font-medium text-primary">{service.scope}</p>
              {detail && <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <Button size="sm" className="h-auto min-h-9 whitespace-normal" onClick={() => navigate("/plans")}>
                  {detail.status === "available" ? t("landing.getStarted") : t("landing.preOrder")}
                </Button>
                <Button size="sm" variant="ghost" asChild><Link to={`/services/${service.id}`}>{t("landing.learnMore")} <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
              </div>}
            </article>;
          })}
        </div>
        <p className="mt-8 max-w-3xl text-base font-medium leading-relaxed">{copy.servicesClosing}</p>
        <div className="mt-6 border-y border-border py-5">
          <h3 className="text-lg font-semibold">{t("landing.phoneFirstTitle")}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("landing.phoneFirstBody")}</p>
          <Button asChild variant="link" className="mt-2 h-auto whitespace-normal px-0"><Link to="/services/voice">{t("landing.phoneFirstLink")}<ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button className="h-auto min-h-11 whitespace-normal" onClick={() => navigate('/demo')}>{copy.demo}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Button>
          <Button variant="link" className="h-auto whitespace-normal" onClick={() => document.getElementById('addons')?.scrollIntoView({behavior:'smooth'})}>{copy.addons}</Button>
        </div>
        <p className="mt-4 max-w-4xl text-xs text-muted-foreground leading-relaxed">{t("landing.preOrderNote")}</p>
      </div>
    </section>
  );
};
export default ServicesGrid;
