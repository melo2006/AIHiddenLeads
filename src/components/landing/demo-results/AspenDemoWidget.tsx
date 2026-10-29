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
  const [dismissed, setDismissed] = useState(false);
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [chatVisited, setChatVisited] = useState(false);
  const [recommendedPlan, setRecommendedPlan] = useState<string | null>(null);
  const [videoAvatar, setVideoAvatar] = useState<VideoAvatar | undefined>();
  useEffect(() => { let active = true; void preloadVoiceIdentity().then(d => { if (active) setVideoAvatar(d?.videoAvatar); }); return () => { active = false; }; }, []);
  const expanded = open || voiceRequested;
  const close = () => { setOpen(false); onClosed(); };
  if (dismissed) return null;
  return <DraggableFloating initialX={12} initialY={window.innerHeight - 90} anchorRight anchorBottom resetKey={expanded ? 'open' : 'closed'}>
    <FloatingPersonFrame open={expanded} mode={mode} onOpen={() => { setMode('voice'); setOpen(true); }} onMinimize={close} onClose={() => { setDismissed(true); close(); }} onMode={next => { setMode(next); if (next === 'chat') setChatVisited(true); }}>
      {mode === 'voice' && <GeminiConversation compact faceFirst avatarInline autoStart leadId={chatProps.leadId} prospectId={chatProps.prospectId} visitorName={chatProps.callerName} onRecommendedPlan={setRecommendedPlan} videoAvatar={matchingAspenVideo(videoAvatar)} />}
      {chatVisited && <div className={mode === 'chat' ? 'aspen-panel min-h-80 overflow-hidden rounded-lg border border-border bg-card' : 'hidden'}><div className="aspen-chat-content"><ChatWidget {...chatProps} embedded active={expanded && mode === 'chat'} /></div></div>}
      <div className="aspen-sales-actions"><AspenSalesActions plan={recommendedPlan} /></div>
    </FloatingPersonFrame>
  </DraggableFloating>;
}
export default function AspenDemoWidget(props:Props){return <AssistantErrorBoundary><AspenDemoWidgetContent {...props}/></AssistantErrorBoundary>;}