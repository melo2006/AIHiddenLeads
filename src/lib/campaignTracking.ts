import { supabase } from '@/integrations/supabase/client';
export const PUBLIC_CAMPAIGN_PATHS = ['/', '/demo', '/demo-site', '/checkout', '/checkout/return', '/book'] as const;
export const PUBLIC_CAMPAIGN_SECTIONS = ['services', 'pricing', 'map-visibility', 'demo-form', 'how-it-works', 'faq', 'addons'] as const;
export type CampaignEvent = 'page_view' | 'scan_started' | 'voice_started' | 'voice_ended' | 'section_view';
const campaignLabel = (value: string) => value.replace(/[^\w .-]/g, '').slice(0, 100);
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
    const {error}=await supabase.functions.invoke('campaign-events',{body:{...labels,event,path}});
    if(error) console.warn('Campaign milestone was not saved');
  } catch {
    // Optional analytics cannot interrupt a page or a conversation.
    console.warn('Campaign milestone was not saved');
  }
}