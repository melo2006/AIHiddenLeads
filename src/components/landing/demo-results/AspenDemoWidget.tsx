import { useState } from 'react';
import { MessageSquare, Mic, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GeminiConversation from '@/components/GeminiConversation';
import ChatWidget from './ChatWidget';
import DraggableFloating from './DraggableFloating';
import avatar from '@/assets/aspen_blonde_avatar.jpg';

type Props = React.ComponentProps<typeof ChatWidget> & { voiceRequested?: boolean; onClosed: () => void };
export default function AspenDemoWidget({ voiceRequested = false, onClosed, ...chatProps }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [chatVisited, setChatVisited] = useState(false);
  const expanded = open || voiceRequested;
  const close = () => { setOpen(false); onClosed(); };
  return <DraggableFloating initialX={12} initialY={window.innerHeight - 90} anchorRight resetKey={expanded ? 'open' : 'closed'}>
    {expanded ? <div className="w-[min(20rem,calc(100vw-24px))] max-h-[65dvh] overflow-y-auto overscroll-contain rounded-lg border-2 border-primary/40 bg-card shadow-2xl">
      <header className="flex items-center gap-2 border-b border-border p-2">
        <img src={avatar} alt="Aspen" className="h-8 w-8 rounded-full object-cover" />
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold">Aspen</p><p className="truncate text-[10px] text-muted-foreground">{chatProps.businessName}</p></div>
        <Button size="icon-sm" variant="ghost" onClick={close} title="Close Aspen" aria-label="Close Aspen"><X /></Button>
      </header>
      <div className="flex gap-1 border-b border-border p-2" aria-label="Aspen conversation mode">
        <Button size="sm" className="flex-1" variant={mode === 'voice' ? 'default' : 'outline'} aria-pressed={mode === 'voice'} onClick={() => setMode('voice')}><Mic />Voice</Button>
        <Button size="sm" className="flex-1" variant={mode === 'chat' ? 'default' : 'outline'} aria-pressed={mode === 'chat'} onClick={() => { setChatVisited(true); setMode('chat'); }}><MessageSquare />Chat</Button>
      </div>
      {mode === 'voice' && <GeminiConversation compact autoStart leadId={chatProps.leadId} prospectId={chatProps.prospectId} visitorName={chatProps.callerName} />}
      {chatVisited && <div className={mode === 'chat' ? '' : 'hidden'}><ChatWidget {...chatProps} embedded active={mode === 'chat'} /></div>}
    </div> : <Button onClick={() => { setMode('voice'); setOpen(true); }} className="h-12 gap-2 shadow-lg" aria-label="Open Aspen chat and voice"><img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" /><span>Talk to Aspen</span><MessageSquare className="h-4 w-4" /></Button>}
  </DraggableFloating>;
}