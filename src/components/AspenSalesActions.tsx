import { Calendar, Globe, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { salesPlanDestination } from '@/lib/salesActions';

export default function AspenSalesActions({ plan = null }: { plan?: string | null }) {
  const { t } = useTranslation();
  const labels = [t("cta.tryWebsite"), t("cta.bookCall"), t("cta.startNow")];
  return <nav aria-label={t("panel.salesNavAria")} className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-border p-2">
    <Button asChild size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal px-2 text-[11px]"><a href="/demo" target="_blank" rel="noopener noreferrer" title={t("panel.salesDemoTitle")}><Globe className="h-3.5 w-3.5 shrink-0" />{labels[0]}</a></Button>
    <Button asChild size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal px-2 text-[11px]"><a href="/book" target="_blank" rel="noopener noreferrer" title={t("panel.salesBookTitle")}><Calendar className="h-3.5 w-3.5 shrink-0" />{labels[1]}</a></Button>
    <Button asChild size="sm" className="col-span-2 h-8 text-xs"><a href={salesPlanDestination(plan)} target="_blank" rel="noopener noreferrer" title={t("panel.salesPlanTitle")}>{labels[2]}<ArrowRight className="h-3.5 w-3.5" /></a></Button>
  </nav>;
}