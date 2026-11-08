import type { ReactNode } from 'react';
import { MessageSquare, Mic, MicOff, X, Minus, AudioLines, Play, Pause, PhoneOff, RotateCcw, Volume2, VolumeX, Maximize2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import aspenPortrait from '@/assets/aspen-video-frame-final.webp';
import aspenIdleBeckon from '@/assets/aspen-idle-wave.gif';

export function PersonPortrait({ name = 'Aspen', avatarUrl, animated = true }: { name?: string; avatarUrl?: string; animated?: boolean }) {
  const src = avatarUrl || (animated ? aspenIdleBeckon : aspenPortrait);
  return <img src={src} alt={name} width={512} height={512} decoding="async" draggable={false} className={`aspen-person-portrait mx-auto object-cover object-top ${animated ? 'aspen-portrait-idle' : ''}`} />;
}

/** Live-call controls for Stage 3 (minimized while talking), wired by the
 * widget to GeminiConversation's shell command surface. Pause here is the
 * TRUE suspend (socket closed); disconnect ends the conversation. */
export interface Stage3Controls {
  suspended: boolean;
  muted: boolean;
  speakerMuted: boolean;
  hasReplay: boolean;
  replaying: boolean;
  onToggleSuspend: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  onReplay: () => void;
}

const barButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted';

const segmentClass = (active: boolean) => `flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`;

/** Voice/Type segmented toggle. Rendered BELOW her chest — in chat mode the
 * frame places it between the portrait and the chat box; in voice mode the
 * widget passes it into GeminiConversation (belowAvatar), which renders it
 * between the live face and the voice/captions panel. Never above her. */
export function AspenModeToggle({ mode, onMode }: { mode: 'voice' | 'chat'; onMode: (mode: 'voice' | 'chat') => void }) {
  return <div className="mx-auto flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5" role="group" aria-label="Conversation mode">
    <button type="button" className={segmentClass(mode === 'voice')} aria-pressed={mode === 'voice'} onClick={() => onMode('voice')}><AudioLines className="h-3.5 w-3.5" />Voice</button>
    <button type="button" className={segmentClass(mode === 'chat')} aria-pressed={mode === 'chat'} onClick={() => onMode('chat')}><MessageSquare className="h-3.5 w-3.5" />Type</button>
  </div>;
}

/**
 * The three-stage Aspen shell (Ron, 2026-11-08):
 *  Stage 1 — idle bubble: one small round bubble (tight face/shoulders crop,
 *    so the waving hand and its baked-in shadow stay out of frame) and ONE
 *    label, "Tap to talk". No stacked bars, no recording notice here.
 *  Stage 2 — open chat: her portrait/live face on top, the segmented
 *    Voice/Type toggle BELOW her chest (between her and the chat thread /
 *    captions box), and ONE chest cluster at the portrait's bottom edge —
 *    drag handle + dash (–) minimizes WITHOUT ending + X ENDS the
 *    conversation. Nothing overlays her face. The recording disclosure
 *    lives here as small print.
 *  Stage 3 — minimized while talking: her bubble head with a pulsing live
 *    ring + one slim bar (pause/resume, disconnect, mic, speaker, replay,
 *    maximize). No thread, no captions — the page stays scrollable.
 * Minimizing without a live session keeps the legacy reopen launcher.
 * Drag lives on the shell (DraggableFloating); minimize preserves calls,
 * close unmounts them (AGENTS.md).
 */
export default function FloatingPersonFrame({ name = 'Aspen', avatarUrl, open, minimized = false, mode, onOpen, onMinimize, onClose, onMode, keepRendered = false, stage3, inviteArrival = false, children }: {
  name?: string; avatarUrl?: string; open: boolean; minimized?: boolean; mode: 'voice' | 'chat';
  onOpen: () => void; onMinimize: () => void; onClose: () => void; onMode: (mode: 'voice' | 'chat') => void; keepRendered?: boolean; stage3?: Stage3Controls; /** Cold-email invite arrival: Stage 1 shows a play affordance + "Hear Aspen" instead of the generic label — the first tap is still the one gesture that unlocks audio and starts her invite greeting. */ inviteArrival?: boolean; children?: ReactNode;
}) {
  const firstName = name?.trim().split(/\s+/)[0];
  const talkLabel = firstName ? `Talk to ${firstName}` : 'Talk to Me';
  // The launcher/bubble shows the agent's own photo. avatarUrl comes from the
  // agent record; undefined means a platform (Aspen) surface with no tenant record,
  // which uses the same default portrait as PersonPortrait. A tenant record with no
  // photo ('') keeps the plain mic icon instead of borrowing Aspen's face.
  const bubblePhoto = avatarUrl === undefined ? aspenIdleBeckon : avatarUrl;
  const stage = open ? 2 : minimized ? (stage3 ? 3 : 0) : 1;
  return <section aria-label={`${name} floating assistant`} className={`aspen-person-shell relative ${open ? 'aspen-person-expanded' : 'aspen-person-collapsed'} ${stage === 1 ? 'aspen-person-stage1 items-center' : ''} ${stage === 3 ? 'aspen-person-stage3' : ''} ${stage === 0 ? '!w-24 items-center' : ''}`}>
    {open && mode === 'chat' && <PersonPortrait name={name} avatarUrl={avatarUrl} />}
    {open && mode === 'chat' && <AspenModeToggle mode={mode} onMode={onMode} />}
    {stage === 1 && <Button variant="ghost" onClick={onOpen} title={inviteArrival ? `Hear ${firstName || 'Aspen'}` : talkLabel} aria-label={inviteArrival ? `Hear ${firstName || 'Aspen'} — tap to hear your demo` : talkLabel} className="flex h-auto flex-col items-center gap-1.5 p-0 hover:bg-transparent">
      <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-primary text-primary-foreground shadow-lg">
        {bubblePhoto ? <img src={bubblePhoto} alt="" draggable={false} className="aspen-bubble-face h-full w-full" /> : <Mic className="h-8 w-8" />}
        {inviteArrival && <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/35"><Play className="h-7 w-7 fill-white text-white" /></span>}
      </span>
      <span className="w-fit rounded-md bg-card/90 px-2 py-0.5 text-center text-xs font-semibold leading-tight text-foreground shadow-sm">{inviteArrival ? `▶ Hear ${firstName || 'Aspen'}` : 'Tap to talk'}</span>
    </Button>}
    {stage === 0 && <Button variant="ghost" onClick={onOpen} title={talkLabel} aria-label={talkLabel} className="flex h-auto flex-col items-center gap-1 p-0 hover:bg-transparent">
      <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-primary text-primary-foreground shadow-md">
        {bubblePhoto ? <img src={bubblePhoto} alt="" className="h-full w-full object-cover" draggable={false} /> : <Mic className="h-8 w-8" />}
      </span>
      <span className="w-fit rounded-md bg-card/90 px-1.5 text-center text-[10px] font-medium leading-tight text-muted-foreground">{talkLabel}</span>
    </Button>}
    {stage === 3 && stage3 && <div className="flex items-center gap-2">
      <button type="button" onClick={onOpen} title={`Open ${name}`} aria-label={`Open ${name}`} className="relative h-14 w-14 shrink-0 rounded-full">
        <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-primary text-primary-foreground shadow-md">
          {bubblePhoto ? <img src={bubblePhoto} alt="" draggable={false} className="aspen-bubble-face h-full w-full" /> : <Mic className="h-6 w-6" />}
        </span>
        <span aria-hidden className={`aspen-live-ring ${stage3.suspended ? 'aspen-live-ring-paused' : ''}`} />
        <span className="sr-only" role="status">{stage3.suspended ? 'Call paused' : 'Call live'}</span>
      </button>
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-card/95 px-1 py-1 shadow-md" role="group" aria-label="Call controls">
        <button type="button" className={barButton} onClick={stage3.onToggleSuspend} title={stage3.suspended ? 'Resume conversation' : 'Pause conversation'} aria-label={stage3.suspended ? 'Resume conversation' : 'Pause conversation'} aria-pressed={stage3.suspended}>{stage3.suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
        <button type="button" className={`${barButton} text-destructive hover:bg-destructive/10`} onClick={stage3.onEnd} title="Disconnect" aria-label="Disconnect"><PhoneOff className="h-4 w-4" /></button>
        <button type="button" className={barButton} onClick={stage3.onToggleMic} title={stage3.muted ? 'Unmute microphone' : 'Mute microphone'} aria-label={stage3.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={stage3.muted}>{stage3.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
        <button type="button" className={barButton} onClick={stage3.onToggleSpeaker} title={stage3.speakerMuted ? 'Turn speaker sound on' : 'Silence speaker'} aria-label={stage3.speakerMuted ? 'Turn speaker sound on' : 'Silence speaker'} aria-pressed={stage3.speakerMuted}>{stage3.speakerMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
        <button type="button" className={`${barButton} disabled:opacity-40`} onClick={stage3.onReplay} disabled={!stage3.hasReplay || stage3.replaying} title="Replay last message" aria-label="Replay last message"><RotateCcw className="h-4 w-4" /></button>
        <button type="button" className={barButton} onClick={onOpen} title="Maximize" aria-label="Maximize"><Maximize2 className="h-4 w-4" /></button>
      </div>
    </div>}
    <div className={open ? 'min-h-0' : keepRendered ? 'aspen-prewarm-offscreen' : 'hidden'} aria-hidden={!open || undefined}>{children}</div>
    {open && <>
      <div className="aspen-person-chest-cluster" role="group" aria-label="Window controls">
        <button type="button" data-drag-handle className="flex h-8 cursor-grab touch-none select-none items-center gap-1 rounded-full border border-primary/60 bg-background/90 px-2 text-primary shadow-sm backdrop-blur-sm transition-colors hover:bg-secondary active:cursor-grabbing" aria-label="Drag widget" title="Drag">
          <GripVertical className="h-3.5 w-3.5" />
          <span className="text-[8px] font-bold uppercase tracking-wider">Drag</span>
        </button>
        <Button size="icon" variant="secondary" className="h-8 w-8 border border-border bg-background/90 text-foreground" onClick={onMinimize} title="Minimize" aria-label="Minimize"><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="secondary" className="h-8 w-8 border border-primary/60 bg-background/90 text-foreground" onClick={onClose} title="End conversation" aria-label="End conversation"><X className="h-4 w-4" /></Button>
      </div>
      <p className="shrink-0 text-center text-[10px] leading-tight text-muted-foreground">Calls are recorded</p>
    </>}
  </section>;
}
