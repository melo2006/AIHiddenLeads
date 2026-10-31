import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {PUBLIC_CAMPAIGN_SECTIONS, trackCampaignEvent} from '@/lib/campaignTracking';
export default function CampaignTracking(){
  const {pathname}=useLocation();
  useEffect(()=>{void trackCampaignEvent('page_view');},[pathname]);
  useEffect(() => {
    if (pathname !== '/' || typeof IntersectionObserver === 'undefined') return;
    const seen = new Set<string>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting && !seen.has(entry.target.id)) {
        seen.add(entry.target.id);
        void trackCampaignEvent('section_view', entry.target.id);
      }
    }, { threshold: 0.15 });
    for (const id of PUBLIC_CAMPAIGN_SECTIONS) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}