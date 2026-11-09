import { useEffect, useRef, useState } from 'react';
import { preloadVoiceIdentity } from '@/lib/voicePreload';
import type { VideoAvatar } from '../../../../supabase/functions/_shared/video-avatar';
import GeminiConversation, { type GeminiShellControls, type GeminiShellState } from '@/components/GeminiConversation';
import ChatWidget from './ChatWidget';
import DraggableFloating from './DraggableFloating';
import FloatingPersonFrame, { AspenModeToggle, type Stage3Controls } from '@/components/FloatingPersonFrame';
import AssistantErrorBoundary from '@/components/AssistantErrorBoundary';
import AspenSalesActions from '@/components/AspenSalesActions';
import { matchingAspenVideo } from '@/lib/aspenFace';
import { PersonPortrait } from '@/components/FloatingPersonFrame';

type Props = React.ComponentProps<typeof ChatWidget> & {
  voiceRequested?: boolean;
  onClosed: () => void;
  onAssistantReady?: () => void;
  /** Verified Demo Gate: session phase forwarded to gemini-session ('pending' = Act 1 host phase). */
  verification?: 'pending' | 'verified';
  /** Cold-email invite arrival: forwarded to gemini-session, which honors it only when the lead's invite arrival was stamped server-side (invite host phase instead of the code gate). */
  invite?: boolean;
  /** Finalized visitor transcript lines (the gate listens for a spoken code). */
  onUserTranscript?: (text: string) => void;
  /** While the gate waits for the code, her live video pauses to the static portrait; the session stays mounted and alive underneath. */
  gateWaiting?: boolean;
};
function AspenDemoWidgetContent({ voiceRequested = false, onClosed, onAssistantReady, verification, invite, onUserTranscript, gateWaiting = false, ...chatProps }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  // The first conversation is prepared live (silently) while the demo loads; later reopenings start normally.
  const [hasOpened, setHasOpened] = useState(false);
  const [prewarm, setPrewarm] = useState(true);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [chatVisited, setChatVisited] = useState(false);
  const [recommendedPlan, setRecommendedPlan] = useState<string | null>(null);
  const [videoAvatar, setVideoAvatar] = useState<VideoAvatar | undefined>();
  // Stage 3 shell wiring (declared early: close() clears the snapshot).
  const shellControlsRef = useRef<GeminiShellControls | null>(null);
  const [shellState, setShellState] = useState<GeminiShellState | null>(null);
  useEffect(() => { let active = true; void preloadVoiceIdentity().then(d => { if (active) { setVideoAvatar(d?.videoAvatar); setIdentityLoaded(true); } }, () => { if (active) setIdentityLoaded(true); }); return () => { active = false; }; }, []);
  // Never hold the website more than 25s, even if preparation stalls.
  useEffect(() => { const t = window.setTimeout(() => onAssistantReady?.(), 25000); return () => window.clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (voiceRequested) { setHasOpened(true); setMinimized(false); } }, [voiceRequested]);
  const expanded = open || voiceRequested;
  const minimize = () => { setOpen(false); setMinimized(true); onClosed(); };
  const close = () => { minimize(); setHasOpened(false); setPrewarm(false); setShellState(null); };
  const mounted = hasOpened || (prewarm && identityLoaded);
  // Stage 3 (minimized while talking): the frame's slim bar drives the live
  // Gemini session through its shell command surface.
  const stage3: Stage3Controls | undefined = mode === 'voice' && shellState && (shellState.live || shellState.suspended) ? {
    suspended: shellState.suspended,
    muted: shellState.muted,
    speakerMuted: shellState.speakerMuted,
    hasReplay: shellState.hasReplay,
    replaying: shellState.replaying,
    onToggleSuspend: () => { if (shellState.suspended) shellControlsRef.current?.resume(); else shellControlsRef.current?.suspend(); },
    onEnd: close,
    onToggleMic: () => shellControlsRef.current?.toggleMic(),
    onToggleSpeaker: () => shellControlsRef.current?.toggleSpeaker(),
    onReplay: () => shellControlsRef.current?.replay(),
  } : undefined;
  return <DraggableFloating initialX={12} initialY={window.innerHeight - 90} anchorRight anchorBottom resetKey={expanded ? 'open' : 'closed'} dragHandlePlacement={expanded ? 'chest' : minimized ? 'top' : 'below'}>
    <FloatingPersonFrame open={expanded} minimized={minimized} mode={mode} onOpen={() => { setHasOpened(true); setMinimized(false); setOpen(true); }} onMinimize={minimize} onClose={close} onMode={next => { setMode(next); if (next === 'chat') setChatVisited(true); }} keepRendered={prewarm} stage3={stage3} inviteArrival={!!invite}>
      {mounted && mode === 'voice' && <>
        {gateWaiting && <div className="aspen-panel flex flex-col items-center gap-2 px-4 py-3 text-center" role="status">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-primary/50">
            <PersonPortrait animated={false} />
          </div>
          <p className="text-xs font-medium text-foreground">Aspen is waiting for your code</p>
          <p className="text-[11px] leading-snug text-muted-foreground">She is still here — say the 4 digits out loud or type them in the card.</p>
        </div>}
        <div className={gateWaiting ? 'hidden' : 'flex min-h-0 flex-1 flex-col'} aria-hidden={gateWaiting || undefined}>
          <GeminiConversation compact faceFirst avatarInline autoStart={expanded} consentOnOpen={expanded} prewarm={prewarm} onPrewarmed={() => onAssistantReady?.()} leadId={chatProps.leadId} prospectId={chatProps.prospectId} visitorName={chatProps.callerName} onRecommendedPlan={setRecommendedPlan} videoAvatar={matchingAspenVideo(videoAvatar)} verification={verification} invite={invite} onUserTranscript={onUserTranscript} shellControlsRef={shellControlsRef} onShellState={setShellState} belowAvatar={<AspenModeToggle mode={mode} onMode={next => { setMode(next); if (next === 'chat') setChatVisited(true); }} />} />
        </div>
      </>}
      {chatVisited && <div className={mode === 'chat' ? 'aspen-panel min-h-80 overflow-hidden rounded-lg border border-border bg-card' : 'hidden'}><div className="aspen-chat-content"><ChatWidget {...chatProps} embedded active={expanded && mode === 'chat'} /></div></div>}
      <div className="aspen-sales-actions"><AspenSalesActions plan={recommendedPlan} /></div>
    </FloatingPersonFrame>
  </DraggableFloating>;
}
export default function AspenDemoWidget(props:Props){return <AssistantErrorBoundary><AspenDemoWidgetContent {...props}/></AssistantErrorBoundary>;}