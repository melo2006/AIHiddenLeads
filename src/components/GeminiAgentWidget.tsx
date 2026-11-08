import { useEffect, useRef, useState, type CSSProperties } from 'react';
import GeminiConversation, { type GeminiShellControls, type GeminiShellState } from './GeminiConversation';
import DraggableFloating from '@/components/landing/demo-results/DraggableFloating';
import { preloadVoiceIdentity } from '@/lib/voicePreload';
import ChatWidget from '@/components/landing/demo-results/ChatWidget';
import AspenSalesActions from '@/components/AspenSalesActions';
import FloatingPersonFrame, { AspenModeToggle, type Stage3Controls } from '@/components/FloatingPersonFrame';
import { matchingAspenVideo } from '@/lib/aspenFace';
import { SIMLI_FACE_CATALOG } from '@/lib/simliFaceCatalog';
import { ALEX_FACE_ID } from '../../supabase/functions/_shared/alex-guide';

import { themeVariables, type WidgetTheme } from '../../supabase/functions/_shared/widget-theme';
import type { VideoAvatar } from '../../supabase/functions/_shared/video-avatar';

interface Props { agentId?: string; leadId?: string; prospectId?: string; businessName?: string; callerName?: string; onClose?: () => void; floating?: boolean; autoStart?: boolean; /** 'alex' renders the platform setup guide (Alex — Support Specialist, Lukas face) instead of a tenant agent; mounted only inside the setup wizard. */ guide?: 'alex'; }
export const ALEX_GUIDE_LABEL = 'Alex — Support Specialist';
const alexPortrait = SIMLI_FACE_CATALOG.find(f => f.id === ALEX_FACE_ID)?.image;
const alexVideoAvatar: VideoAvatar = { enabled: true, provider: 'simli', faceId: ALEX_FACE_ID, position: 'bottom-right', size: 200, shape: 'circle' };
export default function GeminiAgentWidget({ agentId, leadId, prospectId, businessName, callerName, onClose, floating = false, autoStart = false, guide }: Props) {
 const isGuide = guide === 'alex';
 const [open,setOpen]=useState(!floating);
 const [hasOpened,setHasOpened]=useState(!floating);
 const [clickedOpen,setClickedOpen]=useState(false);
 const [minimized,setMinimized]=useState(false);
 const [mode,setMode]=useState<'voice'|'chat'>('voice');
 const [chatVisited,setChatVisited]=useState(false);
 const [recommendedPlan,setRecommendedPlan]=useState<string|null>(null);
 const [identity,setIdentity]=useState<{id?:string;name:string;businessName:string;avatarUrl:string;theme?:WidgetTheme;videoAvatar?:VideoAvatar}>({name:'Aspen',businessName:businessName||'AI Hidden Leads',avatarUrl:''});
 const [identityReady,setIdentityReady]=useState(false);
 useEffect(()=>{if(isGuide){setIdentity({name:'Alex',businessName:'AI Hidden Leads',avatarUrl:alexPortrait || '',videoAvatar:alexVideoAvatar});setIdentityReady(true);return;}let active=true;setIdentityReady(false);void preloadVoiceIdentity(agentId).then(data=>{if(!active)return;if(data?.name){setIdentity({...data,businessName:businessName||data.businessName});setIdentityReady(true);}});return()=>{active=false;};},[agentId,leadId,prospectId,businessName,isGuide]);
 const [prewarm,setPrewarm]=useState(floating && !agentId && !isGuide);
 const openWidget=()=>{setHasOpened(true);setClickedOpen(true);setMinimized(false);setOpen(true);};
 useEffect(()=>{if(agentId || isGuide || !floating)return;const show=(event:Event)=>{const next=(event as CustomEvent).detail?.mode==='chat'?'chat':'voice';setMode(next);setChatVisited(next==='chat');setHasOpened(true);setClickedOpen((event as CustomEvent).detail?.start===true);setMinimized(false);setOpen(true);};window.addEventListener('open-homepage-aspen',show);return()=>window.removeEventListener('open-homepage-aspen',show);},[agentId,floating]);
 // Guide mode (Alex) passes its own Lukas portrait through: without this the
 // frame and the pre-live portrait fall back to Aspen's assets. The tenant
 // (agentId) and platform Aspen (no agentId) paths keep their semantics —
 // a tenant record's avatarUrl ('' = mic icon) and undefined = Aspen assets.
 const faceUrl = isGuide ? (identity.avatarUrl || undefined) : agentId ? identity.avatarUrl : undefined;
 // Stage 3 (minimized while talking): the frame's slim bar drives the live
 // Gemini session through its shell command surface.
 const shellControlsRef = useRef<GeminiShellControls | null>(null);
 const [shellState, setShellState] = useState<GeminiShellState | null>(null);
 const closeAssistant=()=>{setOpen(false);setMinimized(true);setHasOpened(false);setClickedOpen(false);setPrewarm(false);setShellState(null);};
 const stage3: Stage3Controls | undefined = mode === 'voice' && shellState && (shellState.live || shellState.suspended) ? {
   suspended: shellState.suspended,
   muted: shellState.muted,
   speakerMuted: shellState.speakerMuted,
   hasReplay: shellState.hasReplay,
   replaying: shellState.replaying,
   onToggleSuspend: () => { if (shellState.suspended) shellControlsRef.current?.resume(); else shellControlsRef.current?.suspend(); },
   onEnd: closeAssistant,
   onToggleMic: () => shellControlsRef.current?.toggleMic(),
   onToggleSpeaker: () => shellControlsRef.current?.toggleSpeaker(),
   onReplay: () => shellControlsRef.current?.replay(),
 } : undefined;
 const changeMode=(next:'voice'|'chat')=>{if(isGuide && next==='chat')return;setMode(next);if(next==='chat')setChatVisited(true);};
 const canPrewarm = prewarm && identityReady && !identity.videoAvatar?.enabled;
 const mounted = hasOpened || canPrewarm;
 const content=<>
  <FloatingPersonFrame name={identity.name} avatarUrl={faceUrl} open={open} minimized={minimized} mode={mode} onOpen={openWidget} onMinimize={()=>{setOpen(false);setMinimized(true);}} onClose={closeAssistant} onMode={changeMode} keepRendered={canPrewarm} stage3={stage3}>
   {hasOpened && mode==='voice' && !identityReady && <div role="status" className="aspen-panel text-muted-foreground">Connecting…</div>}
   {mounted && mode==='voice' && identityReady && <GeminiConversation compact faceFirst avatarUrl={faceUrl} autoStart={clickedOpen || autoStart} consentOnOpen={clickedOpen} prewarm={canPrewarm} agentId={isGuide ? undefined : identity.id || agentId} leadId={leadId} prospectId={prospectId} name={identity.name} visitorName={callerName} onRecommendedPlan={setRecommendedPlan} videoAvatar={isGuide ? identity.videoAvatar : agentId ? identity.videoAvatar : matchingAspenVideo(identity.videoAvatar)} guide={guide} avatarInline shellControlsRef={shellControlsRef} onShellState={setShellState} belowAvatar={<AspenModeToggle mode={mode} onMode={changeMode} />} />}
   {chatVisited && <div className={mode==='chat'?'aspen-panel min-h-80 overflow-hidden rounded-lg border border-border bg-card':'hidden'}><div className="aspen-chat-content"><ChatWidget embedded active={open && mode==='chat'} businessName={businessName || identity.businessName} businessNiche="general" websiteUrl={window.location.origin} businessInfo="AI Hidden Leads provides AI voice and chat assistants, B2B lead generation and search growth services. Refer visitors to the current homepage for pricing and package details." callerName={callerName} leadId={leadId} prospectId={prospectId} /></div></div>}
   {open && isGuide && <p className="aspen-guide-label text-center text-xs font-semibold text-muted-foreground">{ALEX_GUIDE_LABEL}</p>}
   {!isGuide && (!agentId || leadId || prospectId) && <div className="aspen-sales-actions"><AspenSalesActions plan={recommendedPlan} /></div>}
  </FloatingPersonFrame>
 </>;
 const themedContent=<div style={agentId ? themeVariables(identity.theme) as CSSProperties : undefined}>{content}</div>;
  return <DraggableFloating initialX={12} initialY={window.innerHeight-90} anchorRight anchorBottom resetKey={open ? 'open' : 'closed'} dragHandlePlacement={open ? 'chest' : minimized ? 'top' : 'below'}>{themedContent}</DraggableFloating>;
}
