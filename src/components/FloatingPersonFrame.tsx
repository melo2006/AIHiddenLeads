import { useEffect, useRef, type ReactNode } from 'react';
import { MessageSquare, Mic, MicOff, X, Minus, AudioLines, Play, Pause, PhoneOff, RotateCcw, Volume2, VolumeX, Maximize2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import aspenPortrait from '@/assets/aspen-video-frame-final.webp';
import aspenIdleBeckon from '@/assets/aspen-idle-wave.gif';

/** Persona name badge (Ron, 2026-11-13): a lower-third style pill at
 * the bottom of the portrait/video area, so visitors know and remember
 * who they are talking to — the panel showed Aspen's / Sara's / Alex's
 * face but never their name. Purely presentational: pointer-events-none
 * and NOT a control (the 2026-11-12 rule stands — no control overlaps
 * her). Callers pass the display name from the same identity/persona
 * config that selects the face and voice (the widget's displayName,
 * which follows persona swaps; PERSONAS[activePersona] inside the
 * conversation), never a hardcoded string. Only the first name shows,
 * matching the shell's existing "Talk to {firstName}" convention.
 * Rendered only inside a positioned (relative) portrait container and
 * only while the panel is open — never on the Stage 1 bubble or the
 * Stage 3 minimized bar. */
export function PersonaNameLabel({ name, variant = 'overlay' }: { name: string; /** 'overlay' = the lower-third pill over the portrait (default, unchanged). 'dock' = the FOCUS VIEW bottom dock: same pill, larger, in flow next to the dock controls (2026-11-14). */ variant?: 'overlay' | 'dock' }) {
  const label = name?.trim().split(/\s+/)[0];
  if (!label) return null;
  if (variant === 'dock') {
    return <span data-testid="persona-name-label" aria-hidden="true" className="pointer-events-none shrink-0">
      <span className="block whitespace-nowrap rounded-full bg-black/55 px-3.5 py-1 text-sm font-semibold leading-tight tracking-wide text-white shadow-sm backdrop-blur-sm">{label}</span>
    </span>;
  }
  return <span data-testid="persona-name-label" aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2">
    <span className="block whitespace-nowrap rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-semibold leading-tight tracking-wide text-white shadow-sm backdrop-blur-sm">{label}</span>
  </span>;
}

export function PersonPortrait({ name = 'Aspen', avatarUrl, animated = true, nameLabel = false }: { name?: string; avatarUrl?: string; animated?: boolean; /** Overlay the PersonaNameLabel at the portrait's bottom edge (chat mode + the consent screen). The livebox does NOT pass this: its label is driven by the conversation's active persona and rendered at livebox level, over portrait and live video alike. */ nameLabel?: boolean }) {
  const src = avatarUrl || (animated ? aspenIdleBeckon : aspenPortrait);
  const img = <img src={src} alt={name} width={512} height={512} decoding="async" draggable={false} className={`aspen-person-portrait mx-auto object-cover object-top ${animated ? 'aspen-portrait-idle' : ''}`} />;
  if (!nameLabel) return img;
  return <span className="relative block shrink-0">{img}<PersonaNameLabel name={name} /></span>;
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

const barButton = 'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted';

/** Stage 3 LIVE face (2026-11-14): while a call is live, the minimized
 * bar shows the presenter's REAL moving face — lips moving — not her
 * still photo and never the waving-hand idle animation (that belongs
 * to Stage 1, the not-yet-started state). The live media already lives
 * inside this same shell (the conversation stays mounted while
 * minimized): SimliAvatar marks its keyed canvas / raw video with
 * [data-live-face-source], and this canvas mirrors the active one
 * frame by frame, cover-cropped to the circle. The still photo stays
 * underneath, so if no frame ever arrives (voice-only fallback) the
 * mirror simply never paints and the photo shows, exactly as before.
 * Sizing: the face circle is 66px — +18% over the old 56px (Ron's
 * 15–20% band, 2026-11-14: just enough for mouth movement to read,
 * not bigger); the bar buttons grow in proportion, 36px → 42px. */
function Stage3LiveFace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      const canvas = canvasRef.current;
      const shell = canvas?.closest('.aspen-person-shell');
      if (canvas && shell) {
        const candidates = Array.from(shell.querySelectorAll('[data-live-face-source]'));
        // Prefer the keyed canvas (the transparent face); the raw
        // video is the source only when keying is off (its canvas
        // carries the 'hidden' class then).
        const source = candidates.find((el) => el.tagName === 'CANVAS' && !el.classList.contains('hidden'))
          ?? candidates.find((el) => el.tagName === 'VIDEO');
        if (source) {
          const sw = source instanceof HTMLVideoElement ? source.videoWidth : (source as HTMLCanvasElement).width;
          const sh = source instanceof HTMLVideoElement ? source.videoHeight : (source as HTMLCanvasElement).height;
          const ctx = canvas.getContext('2d');
          if (ctx && sw > 0 && sh > 0) {
            const size = canvas.width;
            const scale = Math.max(size / sw, size / sh);
            const dw = sw * scale;
            const dh = sh * scale;
            ctx.drawImage(source as CanvasImageSource, (size - dw) / 2, 0, dw, dh);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={canvasRef} width={132} height={132} data-testid="stage3-live-face" aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}

const segmentClass = (active: boolean) => `flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-foreground hover:bg-muted'}`;

/** Voice/Type segmented toggle. Rendered INSIDE the panel, never over the
 * portrait — in chat mode the frame places it under the window-controls
 * row, between the portrait and the chat box; in voice mode the widget
 * passes it into GeminiConversation (belowAvatar), which renders it in
 * the voice panel's toggle row, under the window-controls row. */
export function AspenModeToggle({ mode, onMode }: { mode: 'voice' | 'chat'; onMode: (mode: 'voice' | 'chat') => void }) {
  // Ron's rule (2026-11-09, after his Z Fold screenshots): BOTH options stay
  // fully visible in BOTH states. The pill therefore carries its OWN opaque
  // card background (never a translucent wash) and the inactive segment uses
  // full-strength foreground text — a muted/translucent inactive option
  // vanished over the gallery photos behind the floating widget.
  return <div className="mx-auto flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-card p-0.5 shadow-md" role="group" aria-label="Conversation mode">
    <button type="button" className={segmentClass(mode === 'voice')} aria-pressed={mode === 'voice'} onClick={() => onMode('voice')}><AudioLines className="h-3.5 w-3.5" />Voice</button>
    <button type="button" className={segmentClass(mode === 'chat')} aria-pressed={mode === 'chat'} onClick={() => onMode('chat')}><MessageSquare className="h-3.5 w-3.5" />Type</button>
  </div>;
}

/** Window controls — drag handle + dash (–) minimizes WITHOUT ending +
 * X ENDS the conversation — as ONE in-flow row (the historical class name
 * is kept: it began life as the "chest cluster").
 * Panel layout fix (2026-11-12, Ron's circled /agents/realtors
 * screenshot): the row used to be absolutely positioned across the
 * portrait's bottom edge, slicing her torso — "half of her body
 * disappears" behind the buttons. It now renders IN FLOW inside the
 * panel, as the panel's first row below its top border, so the portrait
 * ends cleanly at the panel's top edge and NO control overlaps her:
 * in voice mode the widgets hand this row to GeminiConversation's
 * `windowControls` slot (top of the voice panel card); in chat mode the
 * frame renders it itself, between the portrait and the Voice/Type
 * toggle. The drag button keeps [data-drag-handle]: DraggableFloating
 * delegates dragging to its container, so the handle drags the whole
 * widget from its in-panel home exactly as before. */
export function AspenWindowControls({ onMinimize, onClose }: { onMinimize: () => void; onClose: () => void }) {
  return <div className="aspen-person-chest-cluster" role="group" aria-label="Window controls">
    <button type="button" data-drag-handle className="flex h-8 cursor-grab touch-none select-none items-center gap-1 rounded-full border border-primary/60 bg-background/90 px-2 text-primary shadow-sm backdrop-blur-sm transition-colors hover:bg-secondary active:cursor-grabbing" aria-label="Drag widget" title="Drag">
      <GripVertical className="h-3.5 w-3.5" />
      <span className="text-[8px] font-bold uppercase tracking-wider">Drag</span>
    </button>
    <Button size="icon" variant="secondary" className="h-8 w-8 border border-border bg-background/90 text-foreground" onClick={onMinimize} title="Minimize" aria-label="Minimize"><Minus className="h-4 w-4" /></Button>
    <Button size="icon" variant="secondary" className="h-8 w-8 border border-primary/60 bg-background/90 text-foreground" onClick={onClose} title="End conversation" aria-label="End conversation"><X className="h-4 w-4" /></Button>
  </div>;
}

/**
 * The three-stage Aspen shell (Ron, 2026-11-08):
 *  Stage 1 — idle bubble: one small round bubble (tight face/shoulders crop,
 *    so the waving hand and its baked-in shadow stay out of frame) and ONE
 *    label, "Tap to talk". No stacked bars, no recording notice here.
 *  Stage 2 — open chat: her portrait/live face on top, ending cleanly at
 *    the panel's top edge; INSIDE the panel, the window-controls row
 *    (drag + minimize + end) sits first, with the segmented Voice/Type
 *    toggle directly under it (between the controls and the chat thread /
 *    captions box). Nothing overlays her — no control crosses the
 *    portrait (2026-11-12 panel layout fix). The recording disclosure
 *    lives here as small print.
 *  Stage 3 — minimized while talking: her bubble head with a pulsing live
 *    ring + one slim bar (pause/resume, disconnect, mic, speaker, replay,
 *    maximize). No thread, no captions — the page stays scrollable.
 * Minimizing without a live session keeps the legacy reopen launcher.
 * Drag lives on the shell (DraggableFloating); minimize preserves calls,
 * close unmounts them (AGENTS.md).
 */
export default function FloatingPersonFrame({ name = 'Aspen', avatarUrl, open, minimized = false, mode, onOpen, onMinimize, onClose, onMode, keepRendered = false, stage3, inviteArrival = false, focus = false, children }: {
  name?: string; avatarUrl?: string; open: boolean; minimized?: boolean; mode: 'voice' | 'chat';
  onOpen: () => void; onMinimize: () => void; onClose: () => void; onMode: (mode: 'voice' | 'chat') => void; keepRendered?: boolean; stage3?: Stage3Controls; /** Cold-email invite arrival: Stage 1 shows a play affordance + "Hear Aspen" instead of the generic label — the first tap is still the one gesture that unlocks audio and starts her invite greeting. */ inviteArrival?: boolean; /** FOCUS VIEW (2026-11-14): the conversation reports captions-off; the shell widens (CSS .aspen-person-focus) so the presenter floats ~25% larger with no frame around her. */ focus?: boolean; children?: ReactNode;
}) {
  const firstName = name?.trim().split(/\s+/)[0];
  const talkLabel = firstName ? `Talk to ${firstName}` : 'Talk to Me';
  // The launcher/bubble shows the agent's own photo. avatarUrl comes from the
  // agent record; undefined means a platform (Aspen) surface with no tenant record,
  // which uses the same default portrait as PersonPortrait. A tenant record with no
  // photo ('') keeps the plain mic icon instead of borrowing Aspen's face.
  const bubblePhoto = avatarUrl === undefined ? aspenIdleBeckon : avatarUrl;
  const stage = open ? 2 : minimized ? (stage3 ? 3 : 0) : 1;
  return <section aria-label={`${name} floating assistant`} className={`aspen-person-shell relative ${open ? 'aspen-person-expanded' : 'aspen-person-collapsed'} ${open && focus ? 'aspen-person-focus' : ''} ${stage === 1 ? 'aspen-person-stage1 items-center' : ''} ${stage === 3 ? 'aspen-person-stage3' : ''} ${stage === 0 ? '!w-24 items-center' : ''}`}>
    {open && mode === 'chat' && <PersonPortrait name={name} avatarUrl={avatarUrl} nameLabel />}
    {open && mode === 'chat' && <AspenWindowControls onMinimize={onMinimize} onClose={onClose} />}
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
      <button type="button" onClick={onOpen} title={`Open ${name}`} aria-label={`Open ${name}`} className="relative h-[66px] w-[66px] shrink-0 rounded-full">
        <span className="relative flex h-[66px] w-[66px] items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-primary text-primary-foreground shadow-md">
          {bubblePhoto ? <img src={bubblePhoto} alt="" draggable={false} className="aspen-bubble-face h-full w-full" /> : <Mic className="h-6 w-6" />}
          <Stage3LiveFace />
        </span>
        <span aria-hidden className={`aspen-live-ring ${stage3.suspended ? 'aspen-live-ring-paused' : ''}`} />
        <span className="sr-only" role="status">{stage3.suspended ? 'Call paused' : 'Call live'}</span>
      </button>
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-card/95 px-1 py-1 shadow-md" role="group" aria-label="Call controls">
        <button type="button" className={barButton} onClick={stage3.onToggleSuspend} title={stage3.suspended ? 'Resume conversation' : 'Pause conversation'} aria-label={stage3.suspended ? 'Resume conversation' : 'Pause conversation'} aria-pressed={stage3.suspended}>{stage3.suspended ? <Play className="h-[18px] w-[18px]" /> : <Pause className="h-[18px] w-[18px]" />}</button>
        <button type="button" className={`${barButton} text-destructive hover:bg-destructive/10`} onClick={stage3.onEnd} title="Disconnect" aria-label="Disconnect"><PhoneOff className="h-[18px] w-[18px]" /></button>
        <button type="button" className={barButton} onClick={stage3.onToggleMic} title={stage3.muted ? 'Unmute microphone' : 'Mute microphone'} aria-label={stage3.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={stage3.muted}>{stage3.muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}</button>
        <button type="button" className={barButton} onClick={stage3.onToggleSpeaker} title={stage3.speakerMuted ? 'Turn speaker sound on' : 'Silence speaker'} aria-label={stage3.speakerMuted ? 'Turn speaker sound on' : 'Silence speaker'} aria-pressed={stage3.speakerMuted}>{stage3.speakerMuted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}</button>
        <button type="button" className={`${barButton} disabled:opacity-40`} onClick={stage3.onReplay} disabled={!stage3.hasReplay || stage3.replaying} title="Replay last message" aria-label="Replay last message"><RotateCcw className="h-[18px] w-[18px]" /></button>
        <button type="button" className={barButton} onClick={onOpen} title="Maximize" aria-label="Maximize"><Maximize2 className="h-[18px] w-[18px]" /></button>
      </div>
    </div>}
    <div className={open ? 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain' : keepRendered ? 'aspen-prewarm-offscreen' : 'hidden'} aria-hidden={!open || undefined}>{children}</div>
    {open && <p className="shrink-0 text-center text-[10px] leading-tight text-muted-foreground">Calls are recorded</p>}
  </section>;
}
