import { useEffect, useState } from 'react';
import { Mic, X, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GeminiConversation from './GeminiConversation';
import avatar from '@/assets/aspen_blonde_avatar.jpg';
import DraggableFloating from '@/components/landing/demo-results/DraggableFloating';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props { agentId?: string; leadId?: string; prospectId?: string; businessName?: string; callerName?: string; onClose?: () => void; floating?: boolean; }
export default function GeminiAgentWidget({ agentId, leadId, prospectId, businessName, callerName, onClose, floating = false }: Props) {
 const [open,setOpen]=useState(!floating);
 const [dismissed,setDismissed]=useState(false);
 const [identity,setIdentity]=useState({name:'Aspen',businessName:businessName||'AI Hidden Leads',avatarUrl:''});
 const isMobile=useIsMobile();
 useEffect(()=>{let active=true;void supabase.functions.invoke(`voice-agent-public${agentId?`?agentId=${agentId}`:''}`,{method:'GET'}).then(({data})=>{if(active&&data?.name)setIdentity({...data,businessName:businessName||data.businessName});});return()=>{active=false;};},[agentId,leadId,prospectId,businessName]);
 const content=open ? <div className="w-[min(19rem,calc(100vw-1.5rem))] max-h-[55vh] overflow-y-auto rounded-xl border border-border bg-card shadow-lg sm:max-h-[70vh]">
  <div className="flex items-center gap-2 border-b border-border p-2"><img src={identity.avatarUrl||avatar} alt={identity.name} className="h-8 w-8 rounded-full object-cover" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-tight">{identity.name}</p><p className="truncate text-[10px] text-muted-foreground">{businessName || identity.businessName}</p></div><Button size="icon" variant="ghost" className="h-7 w-7" title="Minimize" aria-label="Minimize voice assistant" onClick={()=>setOpen(false)}><Minus className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" title="Close voice assistant" aria-label="Close voice assistant" onClick={()=>{setDismissed(true);onClose?.();}}><X className="h-3.5 w-3.5" /></Button></div>
  <GeminiConversation compact agentId={agentId} leadId={leadId} prospectId={prospectId} name={identity.name} visitorName={callerName} />
 </div> : <button type="button" onClick={()=>setOpen(true)} title={`Talk to ${identity.name}`} aria-label={`Talk to ${identity.name}`} className="relative h-12 w-12 rounded-full border border-border bg-card shadow-lg transition-transform hover:scale-105">
  <img src={identity.avatarUrl||avatar} alt="" className="h-full w-full rounded-full object-cover" />
  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Mic className="h-3 w-3" /></span>
 </button>;
 useEffect(()=>{if(!floating && !open) onClose?.();},[open,floating,onClose]);
 if(dismissed) return null;
 return (floating || isMobile) ? <DraggableFloating initialX={12} initialY={window.innerHeight-90} anchorRight>{content}</DraggableFloating> : content;
}
