import { PhoneOff, TrendingUp, Star, ExternalLink } from "lucide-react";
import type { NicheData } from "@/data/nicheData";
import { HOMEPAGE_EVIDENCE } from '../../../supabase/functions/_shared/homepage-evidence';
import { useTranslation } from 'react-i18next';
const icons = [PhoneOff, TrendingUp, Star];
const StatsSection = (_props: { niche: NicheData }) => {
  const { i18n } = useTranslation();
  const pt = i18n.language.startsWith('pt'); const es = i18n.language.startsWith('es');
  const labels = pt ? ['Chamadas sem resposta','Conversão de prospects qualificados por telefone','Usariam uma empresa que responde a todas as avaliações'] : es ? ['Llamadas sin respuesta','Conversión de prospectos telefónicos calificados','Usarían una empresa que responde a todas las reseñas'] : HOMEPAGE_EVIDENCE.map(e => e.label);
  return <section className="py-12 sm:py-16"><div className="container mx-auto px-5 sm:px-6">
    <h2 className="text-2xl sm:text-3xl font-bold mb-3">{pt ? 'Responder faz diferença.' : es ? 'Responder importa.' : 'Why answering matters.'}</h2>
    <p className="text-sm text-muted-foreground mb-6">{pt ? 'Estudos externos, não resultados dos nossos clientes nem garantias.' : es ? 'Estudios externos, no resultados de nuestros clientes ni garantías.' : 'External research—not our client results, a 2026 market estimate or a performance guarantee.'}</p>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {HOMEPAGE_EVIDENCE.map((e, i) => { const Icon = icons[i] || Star; return <article key={e.value} className="rounded-lg border border-border bg-card p-5">
        <Icon className="h-7 w-7 text-primary mb-4" /><p className="text-4xl font-bold text-primary">{e.value}</p>
        <h3 className="mt-3 font-semibold">{labels[i]}</h3><p className="mt-3 text-xs text-muted-foreground leading-relaxed">{e.caveat}</p>
        <a className="mt-4 inline-flex gap-1 items-center text-xs text-primary underline" href={e.url} target="_blank" rel="noopener noreferrer">{e.source}<ExternalLink className="h-3 w-3 shrink-0" /></a>
      </article>; })}
    </div>
  </div></section>;
};
export default StatsSection;
