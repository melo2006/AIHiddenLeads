import { supabase } from '@/integrations/supabase/client';
export function campaignVisit() {
  try {
    let id=sessionStorage.getItem('campaign-visit');
    if(!id) {id=crypto.randomUUID();sessionStorage.setItem('campaign-visit',id);}
    const params=new URLSearchParams(location.search);
    if(params.has('utm_source')) sessionStorage.setItem('campaign-source',(params.get('utm_source')||'').slice(0,100));
    if(params.has('utm_campaign')) sessionStorage.setItem('campaign-name',(params.get('utm_campaign')||'').slice(0,100));
    return {visitId:id, source:sessionStorage.getItem('campaign-source')||'',campaign:sessionStorage.getItem('campaign-name')||''};
  } catch {return null;}
}
export async function trackCampaignEvent(event:string) {
  const visit=campaignVisit();if(!visit)return;
  const {error}=await supabase.functions.invoke('campaign-events',{body:{...visit,event,path:location.pathname}});
  if(error) console.warn('Campaign milestone was not saved');
}