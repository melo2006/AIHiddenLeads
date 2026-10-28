import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {trackCampaignEvent} from '@/lib/campaignTracking';
export default function CampaignTracking(){
  const {pathname}=useLocation();
  useEffect(()=>{void trackCampaignEvent('page_view');},[pathname]);
  return null;
}