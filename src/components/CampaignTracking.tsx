import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {trackCampaignEvent} from '@/lib/campaignTracking';
export default function CampaignTracking(){
  const {pathname}=useLocation();
  useEffect(()=>{if(['/','/demo','/demo-site','/checkout','/checkout/return','/book'].includes(pathname))void trackCampaignEvent('page_view');},[pathname]);
  return null;
}