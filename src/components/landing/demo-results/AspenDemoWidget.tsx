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
    {expanded ? <div className="aspen-panel w-[min(24rem,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-lg border-2 border-primary/40 bg-card shadow-2xl">
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
      {chatVisited && <div className={mode === 'chat' ? 'aspen-chat-content' : 'hidden'}><ChatWidget {...chatProps} embedded active={mode === 'chat'} /></div>}
    </div> : <Button onClick={() => { setMode('voice'); setOpen(true); }} className="h-auto min-h-[5.25rem] gap-3 px-3 py-1.5 text-base shadow-lg" aria-label="Open Aspen chat and voice"><img src={avatar} alt="" className="h-[72px] w-[72px] shrink-0 rounded-full object-cover" /><span>Ask Aspen</span><MessageSquare className="h-5 w-5" /></Button>}
  </DraggableFloating>;
}