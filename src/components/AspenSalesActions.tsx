import { Calendar, Globe, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { salesPlanDestination } from '@/lib/salesActions';

export default function AspenSalesActions({ plan = null }: { plan?: string | null }) {
  const { i18n } = useTranslation();
  const labels = i18n.language === 'pt-BR' ? ['Teste seu site', 'Agende uma conversa', 'Comece agora'] : i18n.language === 'es' ? ['Prueba tu sitio', 'Reserva una llamada', 'Empieza ahora'] : ['Try your website', 'Book a quick call', 'Start now'];
  return <nav aria-label="Next steps with AI Hidden Leads" className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-border p-2">
    <Button asChild size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal px-2 text-[11px]"><a href="/demo" target="_blank" rel="noopener noreferrer" title="Open website demo in a new tab"><Globe className="h-3.5 w-3.5 shrink-0" />{labels[0]}</a></Button>
    <Button asChild size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal px-2 text-[11px]"><a href="/book" target="_blank" rel="noopener noreferrer" title="Book a 15-minute introduction in a new tab"><Calendar className="h-3.5 w-3.5 shrink-0" />{labels[1]}</a></Button>
    <Button asChild size="sm" className="col-span-2 h-8 text-xs"><a href={salesPlanDestination(plan)} target="_blank" rel="noopener noreferrer" title="Choose your plan in a new tab">{labels[2]}<ArrowRight className="h-3.5 w-3.5" /></a></Button>
  </nav>;
}