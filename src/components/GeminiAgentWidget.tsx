import { useEffect, useState, type CSSProperties } from 'react';
import GeminiConversation from './GeminiConversation';
import DraggableFloating from '@/components/landing/demo-results/DraggableFloating';
import { preloadVoiceIdentity } from '@/lib/voicePreload';
import ChatWidget from '@/components/landing/demo-results/ChatWidget';
import AspenSalesActions from '@/components/AspenSalesActions';
import FloatingPersonFrame from '@/components/FloatingPersonFrame';
import { matchingAspenVideo } from '@/lib/aspenFace';

import { themeVariables, type WidgetTheme } from '../../supabase/functions/_shared/widget-theme';
import type { VideoAvatar } from '../../supabase/functions/_shared/video-avatar';

interface Props { agentId?: string; leadId?: string; prospectId?: string; businessName?: string; callerName?: string; onClose?: () => void; floating?: boolean; autoStart?: boolean; }
export default function GeminiAgentWidget({ agentId, leadId, prospectId, businessName, callerName, onClose, floating = false, autoStart = false }: Props) {
 const [open,setOpen]=useState(!floating);
 const [hasOpened,setHasOpened]=useState(!floating);
 const [clickedOpen,setClickedOpen]=useState(false);
 const [minimized,setMinimized]=useState(false);
 const [mode,setMode]=useState<'voice'|'chat'>('voice');
 const [chatVisited,setChatVisited]=useState(false);
 const [recommendedPlan,setRecommendedPlan]=useState<string|null>(null);
 const [identity,setIdentity]=useState<{id?:string;name:string;businessName:string;avatarUrl:string;theme?:WidgetTheme;videoAvatar?:VideoAvatar}>({name:'Aspen',businessName:businessName||'AI Hidden Leads',avatarUrl:''});
 const [identityReady,setIdentityReady]=useState(false);
 useEffect(()=>{let active=true;setIdentityReady(false);void preloadVoiceIdentity(agentId).then(data=>{if(!active)return;if(data?.name){setIdentity({...data,businessName:businessName||data.businessName});setIdentityReady(true);}});return()=>{active=false;};},[agentId,leadId,prospectId,businessName]);
 const openWidget=()=>{setHasOpened(true);setClickedOpen(true);setMinimized(false);setOpen(true);};
 useEffect(()=>{if(agentId || !floating)return;const show=(event:Event)=>{const next=(event as CustomEvent).detail?.mode==='chat'?'chat':'voice';setMode(next);setChatVisited(next==='chat');setHasOpened(true);setClickedOpen((event as CustomEvent).detail?.start===true);setMinimized(false);setOpen(true);};window.addEventListener('open-homepage-aspen',show);return()=>window.removeEventListener('open-homepage-aspen',show);},[agentId,floating]);
 const faceUrl = agentId ? identity.avatarUrl : undefined;
 const closeAssistant=()=>{setOpen(false);setMinimized(true);setHasOpened(false);setClickedOpen(false);};
 const changeMode=(next:'voice'|'chat')=>{setMode(next);if(next==='chat')setChatVisited(true);};
 const content=<>
  <FloatingPersonFrame name={identity.name} avatarUrl={faceUrl} open={open} minimized={minimized} mode={mode} onOpen={openWidget} onMinimize={()=>{setOpen(false);setMinimized(true);}} onClose={closeAssistant} onMode={changeMode}>
   {hasOpened && mode==='voice' && !identityReady && <div role="status" className="aspen-panel text-muted-foreground">Connecting…</div>}
   {hasOpened && mode==='voice' && identityReady && <GeminiConversation compact faceFirst avatarUrl={faceUrl} autoStart={clickedOpen || autoStart} consentOnOpen={clickedOpen} agentId={identity.id || agentId} leadId={leadId} prospectId={prospectId} name={identity.name} visitorName={callerName} onRecommendedPlan={setRecommendedPlan} videoAvatar={agentId ? identity.videoAvatar : matchingAspenVideo(identity.videoAvatar)} avatarInline />}
   {chatVisited && <div className={mode==='chat'?'aspen-panel min-h-80 overflow-hidden rounded-lg border border-border bg-card':'hidden'}><div className="aspen-chat-content"><ChatWidget embedded active={open && mode==='chat'} businessName={businessName || identity.businessName} businessNiche="general" websiteUrl={window.location.origin} businessInfo="AI Hidden Leads provides AI voice and chat assistants, B2B lead generation and search growth services. Refer visitors to the current homepage for pricing and package details." callerName={callerName} leadId={leadId} prospectId={prospectId} /></div></div>}
   {(!agentId || leadId || prospectId) && <div className="aspen-sales-actions"><AspenSalesActions plan={recommendedPlan} /></div>}
  </FloatingPersonFrame>
 </>;
 const themedContent=<div style={agentId ? themeVariables(identity.theme) as CSSProperties : undefined}>{content}</div>;
  return <DraggableFloating initialX={12} initialY={window.innerHeight-90} anchorRight anchorBottom resetKey={open ? 'open' : 'closed'}>{themedContent}</DraggableFloating>;
}
