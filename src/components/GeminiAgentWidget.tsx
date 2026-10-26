import { useEffect, useState } from 'react';
import { Mic, MessageSquare, X, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GeminiConversation from './GeminiConversation';
import avatar from '@/assets/aspen_blonde_avatar.jpg';
import DraggableFloating from '@/components/landing/demo-results/DraggableFloating';
import { preloadVoiceIdentity } from '@/lib/voicePreload';
import { useIsMobile } from '@/hooks/use-mobile';
import ChatWidget from '@/components/landing/demo-results/ChatWidget';

interface Props { agentId?: string; leadId?: string; prospectId?: string; businessName?: string; callerName?: string; onClose?: () => void; floating?: boolean; autoStart?: boolean; }
export default function GeminiAgentWidget({ agentId, leadId, prospectId, businessName, callerName, onClose, floating = false, autoStart = false }: Props) {
 const [open,setOpen]=useState(!floating);
 const [hasOpened,setHasOpened]=useState(!floating);
 const [clickedOpen,setClickedOpen]=useState(false);
 const [dismissed,setDismissed]=useState(false);
 const [mode,setMode]=useState<'voice'|'chat'>('voice');
 const [chatVisited,setChatVisited]=useState(false);
 const [identity,setIdentity]=useState({name:'Aspen',businessName:businessName||'AI Hidden Leads',avatarUrl:''});
 const isMobile=useIsMobile();
 useEffect(()=>{let active=true;void preloadVoiceIdentity(agentId).then(data=>{if(active&&data?.name)setIdentity({...data,businessName:businessName||data.businessName});});return()=>{active=false;};},[agentId,leadId,prospectId,businessName]);
 const openWidget=()=>{setHasOpened(true);setClickedOpen(true);setOpen(true);};
 const content=<>
  {/* Keep the conversation mounted while minimized so the call stays alive */}
  <div className={`${open?'':'hidden'} aspen-panel w-[min(24rem,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-lg border-2 border-primary/40 bg-card shadow-2xl`}>
   <div className="flex items-center gap-2 border-b border-border p-2"><img src={identity.avatarUrl||avatar} alt={identity.name} className="h-8 w-8 rounded-full object-cover" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-tight">{identity.name}</p><p className="truncate text-[10px] text-muted-foreground">{businessName || identity.businessName}</p></div><Button size="icon" variant="ghost" className="h-7 w-7" title="Minimize" aria-label="Minimize voice assistant" onClick={()=>setOpen(false)}><Minus className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" title="Close voice assistant" aria-label="Close voice assistant" onClick={()=>{setDismissed(true);onClose?.();}}><X className="h-3.5 w-3.5" /></Button></div>
   <div className="flex gap-2 border-b border-border p-2">
    <Button className="flex-1" variant={mode==='voice'?'default':'outline'} aria-pressed={mode==='voice'} onClick={()=>setMode('voice')}><Mic />Voice</Button>
    <Button className="flex-1" variant={mode==='chat'?'default':'outline'} aria-pressed={mode==='chat'} onClick={()=>{setChatVisited(true);setMode('chat');}}><MessageSquare />Chat</Button>
   </div>
   {hasOpened && mode==='voice' && <GeminiConversation compact autoStart={clickedOpen || autoStart} agentId={agentId} leadId={leadId} prospectId={prospectId} name={identity.name} visitorName={callerName} />}
   {chatVisited && <div className={mode==='chat'?'aspen-chat-content':'hidden'}><ChatWidget embedded active={open && mode==='chat'} businessName={businessName || identity.businessName} businessNiche="general" websiteUrl={window.location.origin} businessInfo="AI Hidden Leads provides AI voice and chat assistants, B2B lead generation and search growth services. Refer visitors to the current homepage for pricing and package details." callerName={callerName} leadId={leadId} prospectId={prospectId} /></div>}
  </div>
  {!open && <Button onClick={openWidget} title={`Ask ${identity.name}`} aria-label={`Ask ${identity.name}`} className="h-auto min-h-[5.25rem] gap-3 px-3 py-1.5 text-base shadow-lg">
   <img src={identity.avatarUrl||avatar} alt="" className="h-[72px] w-[72px] shrink-0 rounded-full object-cover" />
   <span>Ask {identity.name}</span><MessageSquare className="h-5 w-5" />
  </Button>}
 </>;
 useEffect(()=>{if(!floating && !open && !hasOpened) onClose?.();},[open,floating,onClose,hasOpened]);
 if(dismissed) return null;
  return (floating || isMobile) ? <DraggableFloating initialX={12} initialY={window.innerHeight-90} anchorRight resetKey={open ? 'open' : 'closed'}>{content}</DraggableFloating> : content;
}
