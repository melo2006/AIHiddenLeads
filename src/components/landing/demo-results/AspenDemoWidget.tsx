import { useEffect, useState } from 'react';
import { preloadVoiceIdentity } from '@/lib/voicePreload';
import type { VideoAvatar } from '../../../../supabase/functions/_shared/video-avatar';
import GeminiConversation from '@/components/GeminiConversation';
import ChatWidget from './ChatWidget';
import DraggableFloating from './DraggableFloating';
import FloatingPersonFrame from '@/components/FloatingPersonFrame';
import AssistantErrorBoundary from '@/components/AssistantErrorBoundary';
import AspenSalesActions from '@/components/AspenSalesActions';
import { matchingAspenVideo } from '@/lib/aspenFace';

type Props = React.ComponentProps<typeof ChatWidget> & { voiceRequested?: boolean; onClosed: () => void };
function AspenDemoWidgetContent({ voiceRequested = false, onClosed, ...chatProps }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [chatVisited, setChatVisited] = useState(false);
  const [recommendedPlan, setRecommendedPlan] = useState<string | null>(null);
  const [videoAvatar, setVideoAvatar] = useState<VideoAvatar | undefined>();
  useEffect(() => { let active = true; void preloadVoiceIdentity().then(d => { if (active) setVideoAvatar(d?.videoAvatar); }); return () => { active = false; }; }, []);
  useEffect(() => { if (voiceRequested) { setHasOpened(true); setMinimized(false); } }, [voiceRequested]);
  const expanded = open || voiceRequested;
  const minimize = () => { setOpen(false); setMinimized(true); onClosed(); };
  const close = () => { minimize(); setHasOpened(false); };
  return <DraggableFloating initialX={12} initialY={window.innerHeight - 90} anchorRight anchorBottom resetKey={expanded ? 'open' : 'closed'}>
    <FloatingPersonFrame open={expanded} minimized={minimized} mode={mode} onOpen={() => { setHasOpened(true); setMinimized(false); setOpen(true); }} onMinimize={minimize} onClose={close} onMode={next => { setMode(next); if (next === 'chat') setChatVisited(true); }}>
      {hasOpened && mode === 'voice' && <GeminiConversation compact faceFirst avatarInline autoStart consentOnOpen={open} leadId={chatProps.leadId} prospectId={chatProps.prospectId} visitorName={chatProps.callerName} onRecommendedPlan={setRecommendedPlan} videoAvatar={matchingAspenVideo(videoAvatar)} />}
      {chatVisited && <div className={mode === 'chat' ? 'aspen-panel min-h-80 overflow-hidden rounded-lg border border-border bg-card' : 'hidden'}><div className="aspen-chat-content"><ChatWidget {...chatProps} embedded active={expanded && mode === 'chat'} /></div></div>}
      <div className="aspen-sales-actions"><AspenSalesActions plan={recommendedPlan} /></div>
    </FloatingPersonFrame>
  </DraggableFloating>;
}
export default function AspenDemoWidget(props:Props){return <AssistantErrorBoundary><AspenDemoWidgetContent {...props}/></AssistantErrorBoundary>;}