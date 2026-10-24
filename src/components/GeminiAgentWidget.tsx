import { useEffect, useState } from 'react';
import { Mic, X, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GeminiConversation from './GeminiConversation';
import avatar from '@/assets/aspen_blonde_avatar.jpg';
import DraggableFloating from '@/components/landing/demo-results/DraggableFloating';
import { supabase } from '@/integrations/supabase/client';

interface Props { agentId?: string; leadId?: string; prospectId?: string; businessName?: string; callerName?: string; onClose?: () => void; floating?: boolean; }
export default function GeminiAgentWidget({ agentId, leadId, prospectId, businessName, callerName, onClose, floating = false }: Props) {
 const [open,setOpen]=useState(!floating);
 const [dismissed,setDismissed]=useState(false);
 const [identity,setIdentity]=useState({name:'Aspen',businessName:businessName||'AI Hidden Leads',avatarUrl:''});
 useEffect(()=>{let active=true;void supabase.functions.invoke(`voice-agent-public${agentId?`?agentId=${agentId}`:''}`,{method:'GET'}).then(({data})=>{if(active&&data?.name)setIdentity({...data,businessName:businessName||data.businessName});});return()=>{active=false;};},[agentId,leadId,prospectId,businessName]);
 const content=open ? <div className="w-[min(24rem,calc(100vw-2rem))] max-h-[75vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
  <div className="flex items-center gap-2 border-b border-border p-3"><img src={identity.avatarUrl||avatar} alt={identity.name} className="h-12 w-12 rounded-full object-cover" /><div className="min-w-0 flex-1"><p className="font-semibold text-sm">{identity.name}</p><p className="truncate text-xs text-muted-foreground">{businessName || identity.businessName}</p></div><Button size="icon" variant="ghost" title="Minimize" onClick={()=>setOpen(false)}><Minimize2 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Close voice assistant" onClick={()=>{setDismissed(true);onClose?.();}}><X className="h-4 w-4" /></Button></div>
  <GeminiConversation compact agentId={agentId} leadId={leadId} prospectId={prospectId} name={identity.name} visitorName={callerName} />
 </div> : <Button onClick={()=>setOpen(true)} className="h-auto gap-2 px-3 py-2"><img src={identity.avatarUrl||avatar} alt="" className="h-10 w-10 rounded-full object-cover" /><Mic className="h-4 w-4" />Talk to {identity.name}</Button>;
 useEffect(()=>{if(!floating && !open) onClose?.();},[open,floating,onClose]);
 if(dismissed) return null;
 return floating ? <DraggableFloating initialX={20} initialY={window.innerHeight-110} anchorRight>{content}</DraggableFloating> : content;
}