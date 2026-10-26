import { Phone, Users, MapPin, Star, Video, ArrowRight, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { homepageSalesCopy } from "@/data/homepageSalesCopy";

const icons = [Phone, Users, MapPin, Star, Video];
const ServicesGrid = () => {
  const { i18n } = useTranslation();
  const copy = homepageSalesCopy(i18n.language);
  const navigate = useNavigate();
  return (
    <section id="services" className="border-y border-border py-12 sm:py-16">
      <div className="container mx-auto px-5 sm:px-6">
        <div className="max-w-3xl mb-8">
          <p className="text-xs font-semibold uppercase text-primary mb-3">AI Hidden Leads</p>
          <h2 className="text-2xl sm:text-4xl font-bold">{copy.title}</h2>
          <p className="mt-4 text-muted-foreground">{copy.description}</p>
          <p className="mt-3 text-sm text-foreground">{copy.technology}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {copy.services.map((service, index) => {
            const Icon = icons[index] || Phone;
            return <article key={service.id} className="min-w-0 rounded-lg border border-border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-5">
                <Icon className="h-12 w-12 text-primary" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">0{index + 1}</span>
              </div>
              <p className="text-xs font-medium text-primary mb-2">{service.scope}</p>
              <h3 className="text-xl font-semibold mb-4">{service.name}</h3>
              <ul className="space-y-3">
                {service.benefits.map(benefit => <li key={benefit} className="flex gap-2 text-sm text-muted-foreground leading-relaxed"><Check className="h-4 w-4 shrink-0 text-primary mt-1" />{benefit}</li>)}
              </ul>
            </article>;
          })}
          <div className="flex flex-col justify-center min-w-0 py-5 md:px-5">
            <p className="text-xl font-semibold">{copy.start}</p>
            <Button className="mt-5 h-auto min-h-12 whitespace-normal" onClick={() => navigate('/demo')}>{copy.demo}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Button>
            <Button variant="link" className="mt-2 h-auto whitespace-normal" onClick={() => document.getElementById('addons')?.scrollIntoView({behavior:'smooth'})}>{copy.addons}</Button>
          </div>
        </div>
        <p className="mt-6 max-w-4xl text-xs text-muted-foreground leading-relaxed">{copy.scope}</p>
      </div>
    </section>
  );
};
export default ServicesGrid;
