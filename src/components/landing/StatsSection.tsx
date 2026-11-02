import { PhoneOff, Voicemail, TrendingUp, Timer, MailX, Star, ExternalLink, ArrowRight } from "lucide-react";
import type { NicheData } from "@/data/nicheData";
import { HOMEPAGE_EVIDENCE } from '../../../supabase/functions/_shared/homepage-evidence';
import { useTranslation } from 'react-i18next';
// Phone mockups folded in from the former BeforeAfterSection (PR: slim
// homepage) — the compact strip under the stats grid keeps that section's
// visual before/after proof without the full phone+laptop showcase.
import oldPhoneRealtors from "@/assets/old-website-phone.png";
import newPhoneRealtors from "@/assets/new-website-phone-aspen-stacked.png";
import oldPhoneMedspa from "@/assets/old-medspa-phone.png";
import newPhoneMedspa from "@/assets/new-medspa-phone.png";
import oldPhoneAuto from "@/assets/old-autodetail-phone.png";
import newPhoneAuto from "@/assets/new-autodetail-phone.png";
import oldPhoneVet from "@/assets/old-vet-phone.png";
import newPhoneVet from "@/assets/new-vet-phone.png";
import oldPhoneMarine from "@/assets/old-marine-phone.png";
import newPhoneMarine from "@/assets/new-marine-phone.png";
const nichePhones: Record<string, { oldPhone: string; newPhone: string }> = {
  realtors: { oldPhone: oldPhoneRealtors, newPhone: newPhoneRealtors },
  medspa: { oldPhone: oldPhoneMedspa, newPhone: newPhoneMedspa },
  autodetail: { oldPhone: oldPhoneAuto, newPhone: newPhoneAuto },
  veterinary: { oldPhone: oldPhoneVet, newPhone: newPhoneVet },
  marine: { oldPhone: oldPhoneMarine, newPhone: newPhoneMarine },
};
const icons = [PhoneOff, Voicemail, TrendingUp, Timer, MailX, Star];
const StatsSection = ({ niche }: { niche: NicheData }) => {
  const phones = nichePhones[niche.id] ?? nichePhones.realtors;
  const { i18n } = useTranslation();
  const pt = i18n.language.startsWith('pt'); const es = i18n.language.startsWith('es');
  const labels = pt ? ['Disseram ter abandonado uma empresa após uma chamada sem resposta','Desligaram no correio de voz sem deixar mensagem','Prospects por telefone convertidos durante a chamada','Mais chance de qualificar um lead contatado em até uma hora','Das empresas nunca responderam a um lead online','Usariam uma empresa que responde a todas as avaliações'] : es ? ['Dijeron haber abandonado una empresa tras una llamada sin respuesta','Colgaron en el buzón de voz sin dejar mensaje','Prospectos telefónicos convertidos durante la llamada','Más probable calificar un lead contactado en una hora','De empresas nunca respondieron a un lead web','Usarían una empresa que responde a todas las reseñas'] : HOMEPAGE_EVIDENCE.map(e => e.label);
  return <section className="py-12 sm:py-16"><div className="container mx-auto px-5 sm:px-6">
    <h2 className="text-2xl sm:text-3xl font-bold mb-3">{pt ? 'Chamadas, correio de voz e leads do site: responder importa.' : es ? 'Llamadas, buzón de voz y leads web: responder importa.' : 'Calls, voicemail and website leads: every answer matters.'}</h2>
    <p className="text-sm text-muted-foreground mb-6">{pt ? 'Estudos externos, não resultados dos nossos clientes nem garantias.' : es ? 'Estudios externos, no resultados de nuestros clientes ni garantías.' : 'External research—not our client results, a 2026 market estimate or a performance guarantee.'}</p>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5">
      {HOMEPAGE_EVIDENCE.map((e, i) => { const Icon = icons[i] || Star; return <article key={e.value} className="rounded-lg border border-border bg-card p-5">
        <Icon className="h-6 w-6 text-primary mb-3" /><p className="text-3xl sm:text-4xl font-bold text-primary">{e.value}</p>
        <h3 className="mt-3 font-semibold">{labels[i]}</h3><p className="mt-3 text-xs text-muted-foreground leading-relaxed">{e.caveat}</p>
        <a className="mt-4 inline-flex gap-1 items-center text-xs text-primary underline" href={e.url} target="_blank" rel="noopener noreferrer">{e.source}<ExternalLink className="h-3 w-3 shrink-0" /></a>
      </article>; })}
    </div>
    <div className="mt-12">
      <div className="flex flex-row items-center justify-center gap-4 sm:gap-8 max-w-xl mx-auto">
        <div className="relative flex-1 max-w-[160px] sm:max-w-[200px]">
          <img src={phones.oldPhone} alt={`Outdated ${niche.label} website on a phone`} loading="lazy" className="w-full h-auto rounded-2xl" />
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-destructive/20 border border-destructive/30 text-destructive text-xs sm:text-sm font-semibold whitespace-nowrap">{pt ? 'Antes' : es ? 'Antes' : 'Before'}</div>
        </div>
        <div className="flex-shrink-0 hidden sm:flex">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <ArrowRight className="w-5 h-5 text-primary" />
          </div>
        </div>
        <div className="relative flex-1 max-w-[170px] sm:max-w-[215px]">
          <div className="relative overflow-hidden rounded-2xl">
            <img src={phones.newPhone} alt={`Modern AI-powered ${niche.label} website`} loading="lazy" className="w-full h-auto" />
          </div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs sm:text-sm font-semibold whitespace-nowrap">{pt ? 'Depois' : es ? 'Después' : 'After'}</div>
        </div>
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">{pt ? 'O mesmo site da empresa — antes da Aspen, e depois.' : es ? 'El mismo sitio web de la empresa: antes de Aspen, y después.' : 'The same business website — before Aspen, and after.'}</p>
    </div>
  </div></section>;
};
export default StatsSection;
