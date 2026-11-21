import { PhoneOff, Voicemail, TrendingUp, Timer, MailX, Star, ExternalLink } from "lucide-react";
import type { NicheData } from "@/data/nicheData";
import { HOMEPAGE_EVIDENCE } from '../../../supabase/functions/_shared/homepage-evidence';
import { useTranslation } from 'react-i18next';
const icons = [PhoneOff, Voicemail, TrendingUp, Timer, MailX, Star];
// The before/after phone mockups that used to sit under this grid were
// removed 2026-11-18 (Ron's call): the business-examples gallery
// (ExamplesGallerySection) replaces that visual proof on the homepage.
// The `niche` prop stays for the Index call site's stability.
const StatsSection = ({ niche }: { niche: NicheData }) => {
  void niche;
  const { i18n } = useTranslation();
  const pt = i18n.language.startsWith('pt'); const es = i18n.language.startsWith('es'); const fr = i18n.language.startsWith('fr');
  const labels = pt ? ['Disseram ter abandonado uma empresa após uma chamada sem resposta','Desligaram no correio de voz sem deixar mensagem','Prospects por telefone convertidos durante a chamada','Mais chance de qualificar um lead contatado em até uma hora','Das empresas nunca responderam a um lead online','Usariam uma empresa que responde a todas as avaliações'] : es ? ['Dijeron haber abandonado una empresa tras una llamada sin respuesta','Colgaron en el buzón de voz sin dejar mensaje','Prospectos telefónicos convertidos durante la llamada','Más probable calificar un lead contactado en una hora','De empresas nunca respondieron a un lead web','Usarían una empresa que responde a todas las reseñas'] : fr ? ['Ont dit avoir abandonné une entreprise après un appel sans réponse','Ont raccroché sur la boîte vocale sans laisser de message','Prospects téléphoniques convertis pendant l\'appel','Plus de chances de qualifier un prospect contacté en moins d\'une heure','Des entreprises n\'ont jamais répondu à un prospect en ligne','Utiliseraient une entreprise qui répond à tous les avis'] : HOMEPAGE_EVIDENCE.map(e => e.label);
  return <section id="benefits" className="py-12 sm:py-16"><div className="container mx-auto px-5 sm:px-6">
    <h2 className="text-2xl sm:text-3xl font-bold mb-3">{pt ? 'Chamadas, correio de voz e leads do site: responder importa.' : es ? 'Llamadas, buzón de voz y leads web: responder importa.' : fr ? 'Appels, boîte vocale et prospects du site Web : chaque réponse compte.' : 'Calls, voicemail and website leads: every answer matters.'}</h2>
    <p className="text-sm text-muted-foreground mb-6">{pt ? 'Estudos externos, não resultados dos nossos clientes nem garantias.' : es ? 'Estudios externos, no resultados de nuestros clientes ni garantías.' : fr ? 'Recherches externes — pas les résultats de nos clients, ni une estimation de marché 2026, ni une garantie de rendement.' : 'External research—not our client results, a 2026 market estimate or a performance guarantee.'}</p>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5">
      {HOMEPAGE_EVIDENCE.map((e, i) => { const Icon = icons[i] || Star; return <article key={e.value} className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-3.5"><Icon className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 text-primary" /><p className="text-3xl sm:text-4xl font-bold text-primary leading-none">{e.value}</p></div>
        <h3 className="mt-2.5 text-xl sm:text-2xl font-bold leading-snug">{labels[i]}</h3><p className="mt-3 text-xs text-muted-foreground leading-relaxed">{e.caveat}</p>
        <a className="mt-4 inline-flex gap-1 items-center text-xs text-primary underline" href={e.url} target="_blank" rel="noopener noreferrer">{e.source}<ExternalLink className="h-3 w-3 shrink-0" /></a>
      </article>; })}
    </div>
  </div></section>;
};
export default StatsSection;
