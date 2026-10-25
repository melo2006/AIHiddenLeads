import { useEffect, useState } from 'react';
import { Mic, X, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GeminiConversation from './GeminiConversation';
import avatar from '@/assets/aspen_blonde_avatar.jpg';
import DraggableFloating from '@/components/landing/demo-results/DraggableFloating';
import { preloadVoiceIdentity } from '@/lib/voicePreload';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props { agentId?: string; leadId?: string; prospectId?: string; businessName?: string; callerName?: string; onClose?: () => void; floating?: boolean; autoStart?: boolean; }
export default function GeminiAgentWidget({ agentId, leadId, prospectId, businessName, callerName, onClose, floating = false, autoStart = false }: Props) {
 const [open,setOpen]=useState(!floating);
 const [hasOpened,setHasOpened]=useState(!floating);
 const [clickedOpen,setClickedOpen]=useState(false);
 const [dismissed,setDismissed]=useState(false);
 const [identity,setIdentity]=useState({name:'Aspen',businessName:businessName||'AI Hidden Leads',avatarUrl:''});
 const isMobile=useIsMobile();
 useEffect(()=>{let active=true;void preloadVoiceIdentity(agentId).then(data=>{if(active&&data?.name)setIdentity({...data,businessName:businessName||data.businessName});});return()=>{active=false;};},[agentId,leadId,prospectId,businessName]);
 const openWidget=()=>{setHasOpened(true);setClickedOpen(true);setOpen(true);};
 const content=<>
  {/* Keep the conversation mounted while minimized so the call stays alive */}
  <div className={`${open?'':'hidden'} w-[min(19rem,calc(100vw-24px))] max-h-[55dvh] overflow-y-auto overscroll-contain rounded-xl border-2 border-primary/40 bg-secondary shadow-2xl sm:max-h-[70vh]`}>
   <div className="flex items-center gap-2 border-b border-border p-2"><img src={identity.avatarUrl||avatar} alt={identity.name} className="h-8 w-8 rounded-full object-cover" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-tight">{identity.name}</p><p className="truncate text-[10px] text-muted-foreground">{businessName || identity.businessName}</p></div><Button size="icon" variant="ghost" className="h-7 w-7" title="Minimize" aria-label="Minimize voice assistant" onClick={()=>setOpen(false)}><Minus className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" title="Close voice assistant" aria-label="Close voice assistant" onClick={()=>{setDismissed(true);onClose?.();}}><X className="h-3.5 w-3.5" /></Button></div>
   {hasOpened && <GeminiConversation compact autoStart={clickedOpen || autoStart} agentId={agentId} leadId={leadId} prospectId={prospectId} name={identity.name} visitorName={callerName} />}
  </div>
  {!open && <button type="button" onClick={openWidget} title={`Talk to ${identity.name}`} aria-label={`Talk to ${identity.name}`} className="relative h-12 w-12 rounded-full border-2 border-primary/50 bg-card shadow-lg transition-transform hover:scale-105">
   <img src={identity.avatarUrl||avatar} alt="" className="h-full w-full rounded-full object-cover" />
   <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Mic className="h-3 w-3" /></span>
  </button>}
 </>;
 useEffect(()=>{if(!floating && !open && !hasOpened) onClose?.();},[open,floating,onClose,hasOpened]);
 if(dismissed) return null;
 return (floating || isMobile) ? <DraggableFloating initialX={12} initialY={window.innerHeight-90} anchorRight>{content}</DraggableFloating> : content;
}
