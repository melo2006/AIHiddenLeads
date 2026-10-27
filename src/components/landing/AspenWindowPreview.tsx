import { useState } from 'react';
import { Mic, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageResponse } from '@/components/ai-elements/message';
import avatar from '@/assets/aspen_blonde_avatar.jpg';
import AspenSalesActions from '@/components/AspenSalesActions';

export default function AspenWindowPreview() {
  const [mode, setMode] = useState<'chat' | 'voice'>('voice');
  return <div className="w-full max-w-sm overflow-hidden rounded-lg border-2 border-primary/40 bg-card shadow-xl" aria-label="Aspen window preview">
    <header className="flex items-center gap-3 border-b border-border p-4">
      <img src={avatar} alt="Aspen" className="h-20 w-20 shrink-0 rounded-full object-cover" />
      <div><p className="text-lg font-semibold leading-tight"><span className="block">Ask</span><span className="block">Aspen</span></p><p className="text-xs text-muted-foreground">AI Hidden Leads · Preview</p></div>
      <span className="ml-auto h-2.5 w-2.5 rounded-full bg-primary" />
    </header>
    <div className="flex gap-2 border-b border-border p-3">
      <Button className="flex-1" variant={mode === 'voice' ? 'default' : 'outline'} aria-pressed={mode === 'voice'} onClick={() => setMode('voice')}><Mic />Voice</Button>
      <Button className="flex-1" variant={mode === 'chat' ? 'default' : 'outline'} aria-pressed={mode === 'chat'} onClick={() => setMode('chat')}><MessageSquare />Chat</Button>
    </div>
    <AspenSalesActions />
    <div className="flex min-h-52 flex-col justify-center gap-4 p-5 text-sm leading-relaxed">
      <MessageResponse>{mode === 'chat' ? "Hi! I'm Aspen. What would you like to know about your business’s AI assistant?" : "Hi! I'm Aspen, your voice assistant. How can I help you today?"}</MessageResponse>
      {mode === 'chat' ? <><p className="ml-8 rounded-lg bg-primary px-3 py-2 text-primary-foreground">Can visitors talk or type to you?</p><MessageResponse>Yes — whichever feels more natural.</MessageResponse></> : <div className="flex h-14 items-center justify-center gap-1.5" aria-hidden="true">{[3,6,9,5,12,8,4,10,6,3].map((height,i)=><span key={i} className={`w-1.5 rounded-full bg-primary ${height > 8 ? 'h-12' : height > 5 ? 'h-8' : 'h-4'}`} />)}</div>}
    </div>
    <footer className="flex items-center justify-between gap-3 border-t border-border p-4 text-muted-foreground">
      <Button className="w-full" onClick={()=>window.dispatchEvent(new CustomEvent('open-homepage-aspen',{detail:{mode}}))}>{mode === 'voice' ? <><Mic/>Talk to Aspen</> : <><MessageSquare/>Chat with Aspen</>}</Button>
    </footer>
  </div>;
}