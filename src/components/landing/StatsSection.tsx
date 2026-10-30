import { PhoneOff, Voicemail, TrendingUp, Timer, MailX, Star, ExternalLink } from "lucide-react";
import type { NicheData } from "@/data/nicheData";
import { HOMEPAGE_EVIDENCE } from '../../../supabase/functions/_shared/homepage-evidence';
import { useTranslation } from 'react-i18next';
const icons = [PhoneOff, Voicemail, TrendingUp, Timer, MailX, Star];
const StatsSection = (_props: { niche: NicheData }) => {
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
  </div></section>;
};
export default StatsSection;
