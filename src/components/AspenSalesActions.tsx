import { Calendar, Globe, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { salesPlanDestination } from '@/lib/salesActions';

// PAGE AWARENESS (homepage-test item 6, 2026-11-21): every action
// here opens its page in a NEW tab — the visitor's live session
// stays in this tab, and before this change Aspen had no idea the
// plans page was open in front of them (they asked her plan
// questions while reading it; she answered as if they were still
// on the homepage). The click announces the destination on the
// 'aspen-sales-nav' window event; a live homepage-sales session's
// page feed (GeminiConversation) forwards it to the proxy as a
// via:'tab' page_context update, so Aspen acknowledges the tab and
// keeps helping in this one. No live session → the event is inert.
// House rule preserved: the actions still open in a new tab and
// never navigate or charge the live conversation automatically.
const announceSalesNav = (path: string) => () => {
  try { window.dispatchEvent(new CustomEvent('aspen-sales-nav', { detail: { path } })); } catch { /* announcement is optional */ }
};

export default function AspenSalesActions({ plan = null }: { plan?: string | null }) {
  const { t } = useTranslation();
  const labels = [t("cta.tryWebsite"), t("cta.bookCall"), t("cta.startNow")];
  return <nav aria-label={t("panel.salesNavAria")} className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-border p-2">
    <Button asChild size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal px-2 text-[11px]"><a href="/demo" target="_blank" rel="noopener noreferrer" title={t("panel.salesDemoTitle")} onClick={announceSalesNav('/demo')}><Globe className="h-3.5 w-3.5 shrink-0" />{labels[0]}</a></Button>
    <Button asChild size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal px-2 text-[11px]"><a href="/book" target="_blank" rel="noopener noreferrer" title={t("panel.salesBookTitle")} onClick={announceSalesNav('/book')}><Calendar className="h-3.5 w-3.5 shrink-0" />{labels[1]}</a></Button>
    <Button asChild size="sm" className="col-span-2 h-8 text-xs"><a href={salesPlanDestination(plan)} target="_blank" rel="noopener noreferrer" title={t("panel.salesPlanTitle")} onClick={announceSalesNav('/plans')}>{labels[2]}<ArrowRight className="h-3.5 w-3.5" /></a></Button>
  </nav>;
}
