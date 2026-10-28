import { useEffect, useState } from 'react';
import { preloadVoiceIdentity } from '@/lib/voicePreload';
import type { VideoAvatar } from '../../../../supabase/functions/_shared/video-avatar';
import { MessageSquare, Mic, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GeminiConversation from '@/components/GeminiConversation';
import ChatWidget from './ChatWidget';
import DraggableFloating from './DraggableFloating';
import avatar from '@/assets/aspen_blonde_avatar.jpg';
import AspenLauncherContent from '@/components/AspenLauncherContent';
import AssistantErrorBoundary from '@/components/AssistantErrorBoundary';
import AspenSalesActions from '@/components/AspenSalesActions';

type Props = React.ComponentProps<typeof ChatWidget> & { voiceRequested?: boolean; onClosed: () => void };
function AspenDemoWidgetContent({ voiceRequested = false, onClosed, ...chatProps }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [chatVisited, setChatVisited] = useState(false);
  const [recommendedPlan, setRecommendedPlan] = useState<string | null>(null);
  const [videoAvatar, setVideoAvatar] = useState<VideoAvatar | undefined>();
  useEffect(() => { let active = true; void preloadVoiceIdentity().then(d => { if (active) setVideoAvatar(d?.videoAvatar); }); return () => { active = false; }; }, []);
  const expanded = open || voiceRequested;
  const close = () => { setOpen(false); onClosed(); };
  return <DraggableFloating initialX={12} initialY={window.innerHeight - 90} anchorRight anchorBottom resetKey={expanded ? 'open' : 'closed'}>
    {expanded ? <div className={`aspen-panel w-[min(24rem,calc(100vw-24px))] ${mode === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'} overscroll-contain rounded-lg border-2 border-primary/40 bg-card shadow-2xl`}>
      <header className="flex items-center gap-2 border-b border-border p-2">
        <img src={avatar} alt="Aspen" className="h-8 w-8 rounded-full object-cover" />
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold">Aspen</p><p className="truncate text-[10px] text-muted-foreground">{chatProps.businessName}</p></div>
        <Button size="icon-sm" variant="ghost" onClick={close} title="Close Aspen" aria-label="Close Aspen"><X /></Button>
      </header>
      <div className="flex gap-1 border-b border-border p-2" aria-label="Aspen conversation mode">
        <Button size="sm" className="flex-1" variant={mode === 'voice' ? 'default' : 'outline'} aria-pressed={mode === 'voice'} onClick={() => setMode('voice')}><Mic />Voice</Button>
        <Button size="sm" className="flex-1" variant={mode === 'chat' ? 'default' : 'outline'} aria-pressed={mode === 'chat'} onClick={() => { setChatVisited(true); setMode('chat'); }}><MessageSquare />Chat</Button>
      </div>
      <AspenSalesActions plan={recommendedPlan} />
      {mode === 'voice' && <GeminiConversation compact autoStart leadId={chatProps.leadId} prospectId={chatProps.prospectId} visitorName={chatProps.callerName} onRecommendedPlan={setRecommendedPlan} videoAvatar={videoAvatar} />}
      {chatVisited && <div className={mode === 'chat' ? 'aspen-chat-content' : 'hidden'}><ChatWidget {...chatProps} embedded active={mode === 'chat'} /></div>}
    </div> : <Button onClick={() => { setMode('voice'); setOpen(true); }} className="h-auto max-w-[calc(100vw-24px)] gap-2 px-2 py-1.5 shadow-lg" aria-label="Open Aspen chat and voice"><AspenLauncherContent /></Button>}
  </DraggableFloating>;
}
export default function AspenDemoWidget(props:Props){return <AssistantErrorBoundary><AspenDemoWidgetContent {...props}/></AssistantErrorBoundary>;}