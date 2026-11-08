import { supabase } from '@/integrations/supabase/client';
export const PUBLIC_CAMPAIGN_PATHS = ['/', '/demo', '/demo-site', '/checkout', '/checkout/return', '/book'] as const;
export const PUBLIC_CAMPAIGN_SECTIONS = ['services', 'pricing', 'map-visibility', 'demo-form', 'how-it-works', 'faq', 'addons'] as const;
export type CampaignEvent = 'page_view' | 'scan_started' | 'voice_started' | 'voice_ended' | 'section_view';
const campaignLabel = (value: string) => value.replace(/[^\w .-]/g, '').slice(0, 100);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Cold-email invite arrivals land on /demo-site with a leadId param (set by
 * the /demo/<slug>/<code> resolver). Persisting that id next to the visit
 * lets campaign-events attribute this tab's milestones to the invited lead
 * (the outreach report). Ad traffic never carries a lead id and is
 * completely unaffected. Malformed values are ignored, never stored.
 */
export function linkCampaignLead(leadId: string | null | undefined) {
  if (!leadId || !UUID_PATTERN.test(leadId)) return;
  try { sessionStorage.setItem('campaign-lead', leadId); } catch { /* storage unavailable: attribution is optional */ }
}
export function campaignLeadId(): string | undefined {
  try {
    const id = sessionStorage.getItem('campaign-lead');
    return id && UUID_PATTERN.test(id) ? id : undefined;
  } catch { return undefined; }
}
export function campaignVisit() {
  if (!PUBLIC_CAMPAIGN_PATHS.some(path => path === location.pathname)) return null;
  try {
    let id=sessionStorage.getItem('campaign-visit');
    if(!id) {id=crypto.randomUUID();sessionStorage.setItem('campaign-visit',id);}
    const params=new URLSearchParams(location.search);
    if(params.has('utm_source')) sessionStorage.setItem('campaign-source',(params.get('utm_source')||'').slice(0,100));
    if(params.has('utm_campaign')) sessionStorage.setItem('campaign-name',(params.get('utm_campaign')||'').slice(0,100));
    return {visitId:id, source:campaignLabel(sessionStorage.getItem('campaign-source')||''),campaign:campaignLabel(sessionStorage.getItem('campaign-name')||''), entryPath: location.pathname};
  } catch {return null;}
}
export async function trackCampaignEvent(event:CampaignEvent, section?: string) {
  // Shared voice transports also run inside private setup/account pages.
  // Those tests are not public campaign conversions and must never be sent.
  const pathname = location.pathname;
  if (!PUBLIC_CAMPAIGN_PATHS.some(publicPath => publicPath === pathname)) return;
  if (event === 'section_view' && (pathname !== '/' || !PUBLIC_CAMPAIGN_SECTIONS.some(id => id === section))) return;
  const path = event === 'section_view' ? `/#${section}` : pathname;
  try {
    const visit=campaignVisit();if(!visit)return;
    const {entryPath: _entryPath, ...labels} = visit;
    const leadId=campaignLeadId();
    const {error}=await supabase.functions.invoke('campaign-events',{body:{...labels,event,path,...(leadId?{leadId}:{})}});
    if(error) console.warn('Campaign milestone was not saved');
  } catch {
    // Optional analytics cannot interrupt a page or a conversation.
    console.warn('Campaign milestone was not saved');
  }
}