import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  // Overlay placement (Ron, 2026-11-14): LEFT side of the chest, bold —
  // the centred semibold pill read as a floating tag in his annotated
  // screenshot. The 'dock' variant above is the focus-view in-flow pill
  // and is deliberately NOT changed by that order.
  return <span data-testid="persona-name-label" aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-2 z-20">
    <span className="block whitespace-nowrap rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-bold leading-tight tracking-wide text-white shadow-sm backdrop-blur-sm">{label}</span>
  </span>;
}

export function PersonPortrait({ name = 'Aspen', avatarUrl, animated = true, nameLabel = false, flat = false }: { name?: string; avatarUrl?: string; animated?: boolean; /** Overlay the PersonaNameLabel at the portrait's bottom edge (chat mode + the consent screen). The livebox does NOT pass this: its label is driven by the conversation's active persona and rendered at livebox level, over portrait and live video alike. */ nameLabel?: boolean; /** TRUE transparency (2026-11-14): suppress the portrait backdrop gradient. The gradient is the LIVEBOX still's designed in-frame backdrop (2026-11-11 black-frame fix); every surface where the portrait floats undocked — chat mode above its dock, the voice consent card, the focus view — passes flat so no rectangular backdrop paints over the page. */ flat?: boolean }) {
  const src = avatarUrl || (animated ? aspenIdleBeckon : aspenPortrait);
  const img = <img src={src} alt={name} width={512} height={512} decoding="async" draggable={false} className={`aspen-person-portrait mx-auto object-cover object-top ${animated ? 'aspen-portrait-idle' : ''}${flat ? ' aspen-person-portrait-flat' : ''}`} />;
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

/** Stage 3 face stack (2026-11-14): the minimized bar's circle shows
 * exactly ONE image at a time — the presenter's REAL moving face while
 * live video is flowing, otherwise her still photo (never the
 * waving-hand idle animation; that belongs to Stage 1, the
 * not-yet-started state). The live media already lives inside this
 * same shell (the conversation stays mounted while minimized):
 * SimliAvatar marks its keyed canvas / raw video with
 * [data-live-face-source], and this canvas mirrors the active one
 * frame by frame, cropped to the circle.
 *
 * DOUBLE-IMAGE FIX (Ron's Publish #52 phone test — "he is
 * superimposing the static picture of himself"): the first version
 * painted the mirror on a TRANSPARENT canvas permanently layered over
 * the still, and cropped it differently from the still's own framing
 * (.aspen-bubble-face zooms 1.5×; the mirror did not). The keyed Simli
 * canvas is transparent everywhere except the face silhouette, so the
 * still showed through all around a differently-scaled live face — a
 * ghostly double face. The stack now enforces the single-image
 * invariant structurally: this component owns BOTH layers, tracks
 * whether frames are actually flowing (a [data-live-face-source] with
 * real dimensions inside this shell), and flips visibility in one
 * render — while frames flow, the still is `invisible` and the mirror
 * carries the opaque bg-primary backdrop; when frames stop (source
 * gone, zero-size, or the image-only fallback), the mirror is
 * `invisible` AND cleared (no stale frame may linger) and the still
 * returns. The mirror's crop also replicates the still's framing
 * exactly (cover-fit at object-position 50% 12%, then the same 1.5×
 * zoom about 50% 30%), so the face does not jump scale when the video
 * takes over or hands back.
 * Sizing: the face circle is 79px — 56px → 66px → 79px, +~20% again
 * at Ron's direction after Publish #52 (the moving face was still too
 * small to read). The bar buttons stay 42px: six 50px buttons beside
 * a 79px face would push the bar past small-phone widths, and 42px
 * already meets this shell's 40px touch-target standard. */
function Stage3LiveFace({ photo }: { photo?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      const canvas = canvasRef.current;
      const shell = canvas?.closest('.aspen-person-shell');
      let flowing = false;
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
          if (sw > 0 && sh > 0) {
            flowing = true;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const size = canvas.width;
              // Replicate .aspen-bubble-face: cover-fit at
              // object-position 50% 12%, then scale(1.5) about
              // 50% 30% — the live face lands exactly where the
              // still's face was.
              const cover = Math.max(size / sw, size / sh);
              const dw0 = sw * cover;
              const dh0 = sh * cover;
              const dx0 = (size - dw0) * 0.5;
              const dy0 = (size - dh0) * 0.12;
              const zoom = 1.5;
              const ox = size * 0.5;
              const oy = size * 0.3;
              ctx.drawImage(source as CanvasImageSource, ox + (dx0 - ox) * zoom, oy + (dy0 - oy) * zoom, dw0 * zoom, dh0 * zoom);
            }
          }
        }
      }
      if (flowing !== liveRef.current) {
        liveRef.current = flowing;
        if (!flowing && canvas) {
          // No stale frame may survive the hand-back to the still.
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setLive(flowing);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, []);
  return <>
    {photo ? <img src={photo} alt="" draggable={false} data-testid="stage3-still-face" className={`aspen-bubble-face h-full w-full ${live ? 'invisible' : ''}`} /> : <Mic className={`h-6 w-6 ${live ? 'invisible' : ''}`} />}
    <canvas ref={canvasRef} width={158} height={158} data-testid="stage3-live-face" data-live={live ? 'true' : 'false'} aria-hidden="true" className={`absolute inset-0 h-full w-full ${live ? 'bg-primary' : 'invisible'}`} />
  </>;
}

const segmentClass = (active: boolean) => `flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-foreground hover:bg-muted'}`;

/** Voice/Type segmented toggle. Rendered INSIDE the panel, never over the
 * portrait — in chat mode the frame places it under the window-controls
 * row, between the portrait and the chat box; in voice mode the widget
 * passes it into GeminiConversation (belowAvatar), which renders it in
 * the voice panel's toggle row, under the window-controls row. */
export function AspenModeToggle({ mode, onMode }: { mode: 'voice' | 'chat'; onMode: (mode: 'voice' | 'chat') => void }) {
  const { t } = useTranslation();
  // Ron's rule (2026-11-09, after his Z Fold screenshots): BOTH options stay
  // fully visible in BOTH states. The pill therefore carries its OWN opaque
  // card background (never a translucent wash) and the inactive segment uses
  // full-strength foreground text — a muted/translucent inactive option
  // vanished over the gallery photos behind the floating widget.
  //
  // Deliberate-tap guard (2026-11-14, Ron's phone test: "I've changed to
  // chat version but I did not ask for chat somehow"): switching mode is
  // destructive — it unmounts the live voice session — so a segment only
  // fires on a genuine tap ON that segment. Each press records where the
  // finger landed; a click whose release point travelled more than 10px
  // from the press point was a brush/drag-over, not a choice, and is
  // ignored. Segments are full 40px touch targets for the same reason:
  // the old ~24px-tall segments sat among the window controls Ron was
  // fighting (drag/minimise/close, speaker popover) and were easy to hit
  // by accident. Keyboard activation (no recorded pointer press) always
  // counts as deliberate.
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const handleClick = (next: 'voice' | 'chat') => (event: ReactMouseEvent<HTMLButtonElement>) => {
    const origin = pressOrigin.current;
    pressOrigin.current = null;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) return;
    onMode(next);
  };
  return <div className="mx-auto flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-card p-1 shadow-md" role="group" aria-label={t("frame.modeAria")}>
    <button type="button" className={segmentClass(mode === 'voice')} aria-pressed={mode === 'voice'} onPointerDown={(event) => { pressOrigin.current = { x: event.clientX, y: event.clientY }; }} onClick={handleClick('voice')}><AudioLines className="h-4 w-4" />{t("frame.voice")}</button>
    <button type="button" className={segmentClass(mode === 'chat')} aria-pressed={mode === 'chat'} onPointerDown={(event) => { pressOrigin.current = { x: event.clientX, y: event.clientY }; }} onClick={handleClick('chat')}><MessageSquare className="h-4 w-4" />{t("frame.type")}</button>
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
  const { t } = useTranslation();
  return <div className="aspen-person-chest-cluster" role="group" aria-label={t("frame.windowAria")}>
    <button type="button" data-drag-handle className="flex h-8 cursor-grab touch-none select-none items-center gap-1 rounded-full border border-primary/60 bg-background/90 px-2 text-primary shadow-sm backdrop-blur-sm transition-colors hover:bg-secondary active:cursor-grabbing" aria-label={t("frame.dragWidget")} title={t("frame.drag")}>
      <GripVertical className="h-3.5 w-3.5" />
      <span className="text-[8px] font-bold uppercase tracking-wider">{t("frame.drag")}</span>
    </button>
    <Button size="icon" variant="secondary" className="h-8 w-8 border border-border bg-background/90 text-foreground" onClick={onMinimize} title={t("frame.minimize")} aria-label={t("frame.minimize")}><Minus className="h-4 w-4" /></Button>
    {/* Button state colours (2026-11-14, Ron-approved spec): × ENDS the
        conversation, so it wears the destructive treatment — red icon +
        red border — instead of matching harmless Minimize (before, the
        only tell was a green vs grey border tint). */}
    <Button size="icon" variant="secondary" className="h-8 w-8 border border-destructive/70 bg-background/90 text-destructive hover:bg-destructive/10" onClick={onClose} title={t("frame.endConversation")} aria-label={t("frame.endConversation")}><X className="h-4 w-4" /></Button>
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
  const { t } = useTranslation();
  const firstName = name?.trim().split(/\s+/)[0];
  const talkLabel = firstName ? t("frame.talkToName", { name: firstName }) : t("frame.talkToMe");
  // The launcher/bubble shows the agent's own photo. avatarUrl comes from the
  // agent record; undefined means a platform (Aspen) surface with no tenant record,
  // which uses the same default portrait as PersonPortrait. A tenant record with no
  // photo ('') keeps the plain mic icon instead of borrowing Aspen's face.
  const bubblePhoto = avatarUrl === undefined ? aspenIdleBeckon : avatarUrl;
  const stage = open ? 2 : minimized ? (stage3 ? 3 : 0) : 1;
  return <section aria-label={t("frame.shellAria", { name })} className={`aspen-person-shell relative ${open ? 'aspen-person-expanded' : 'aspen-person-collapsed'} ${open && focus ? 'aspen-person-focus' : ''} ${stage === 1 ? 'aspen-person-stage1 items-center' : ''} ${stage === 3 ? 'aspen-person-stage3' : ''} ${stage === 0 ? '!w-[112px] items-center' : ''}`}>
    {open && mode === 'chat' && <PersonPortrait name={name} avatarUrl={avatarUrl} nameLabel flat />}
    {/* CHAT DOCK (2026-11-14, Ron's phone test): in chat mode the window
        controls, the Voice/Type toggle and the chat surface used to be
        three bare siblings floating over the page under a portrait whose
        backdrop gradient painted a pasted rectangle — "he floats around
        and there's transparent there, he's not sitting on the base".
        They now share ONE dock card styled exactly like the voice panel
        card, and the portrait (flat = truly transparent) ends at the
        dock's top border, the Publish #38 rule, same as voice mode. */}
    {open && mode === 'chat' && <div data-testid="aspen-chat-dock" className="aspen-chat-dock relative z-10 flex min-h-0 flex-1 flex-col gap-1 rounded-lg border border-primary/40 bg-card p-2 shadow-lg ring-1 ring-foreground/10">
      <AspenWindowControls onMinimize={onMinimize} onClose={onClose} />
      <AspenModeToggle mode={mode} onMode={onMode} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
    </div>}
    {stage === 1 && <Button variant="ghost" onClick={onOpen} title={inviteArrival ? t("frame.hearName", { name: firstName || 'Aspen' }) : talkLabel} aria-label={inviteArrival ? t("frame.hearNameAria", { name: firstName || 'Aspen' }) : talkLabel} className="flex h-auto flex-col items-center gap-1.5 p-0 hover:bg-transparent">
      <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-primary text-primary-foreground shadow-lg">
        {bubblePhoto ? <img src={bubblePhoto} alt="" draggable={false} className="aspen-bubble-face h-full w-full" /> : <Mic className="h-8 w-8" />}
        {inviteArrival && <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/35"><Play className="h-7 w-7 fill-white text-white" /></span>}
      </span>
      <span className="w-fit rounded-md bg-card/90 px-2 py-0.5 text-center text-xs font-semibold leading-tight text-foreground shadow-sm">{inviteArrival ? t("frame.hearNamePlay", { name: firstName || 'Aspen' }) : t('frame.tapToTalk', { defaultValue: 'Tap to talk' })}</span>
    </Button>}
    {/* Stage 0 bubble sizing (2026-11-14): 72px → 86px → 103px (+~20%
        twice, Ron's live tests — the fully-minimized circle was hardly
        visible in the corner, and after Publish #52 the face was still
        too small to read). At 103px the old !w-24 (96px) shell no
        longer contains the circle, so the stage-0 shell widens to
        !w-[112px]; the "Talk to {name}" label layout under the circle
        is unchanged. Stages 1 (80px idle bubble) and 3 (79px live face
        in the minimized bar) are separate states and do NOT follow
        this size. */}
    {stage === 0 && <Button variant="ghost" onClick={onOpen} title={talkLabel} aria-label={talkLabel} className="flex h-auto flex-col items-center gap-1 p-0 hover:bg-transparent">
      <span className="flex h-[103px] w-[103px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-primary text-primary-foreground shadow-md">
        {bubblePhoto ? <img src={bubblePhoto} alt="" className="h-full w-full object-cover" draggable={false} /> : <Mic className="h-8 w-8" />}
      </span>
      <span className="w-fit rounded-md bg-card/90 px-1.5 text-center text-[10px] font-medium leading-tight text-muted-foreground">{talkLabel}</span>
    </Button>}
    {stage === 3 && stage3 && <div className="flex items-center gap-2">
      <button type="button" onClick={onOpen} title={t("frame.openName", { name })} aria-label={t("frame.openName", { name })} className="relative h-[79px] w-[79px] shrink-0 rounded-full">
        <span className="relative flex h-[79px] w-[79px] items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-primary text-primary-foreground shadow-md">
          <Stage3LiveFace photo={bubblePhoto} />
        </span>
        <span aria-hidden className={`aspen-live-ring ${stage3.suspended ? 'aspen-live-ring-paused' : ''}`} />
        <span className="sr-only" role="status">{stage3.suspended ? t("frame.callPaused") : t("frame.callLive")}</span>
      </button>
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-card/95 px-1 py-1 shadow-md" role="group" aria-label={t("frame.callControlsAria")}>
        {/* Button state colours (2026-11-14, Ron-approved spec): the
            Stage-3 bar speaks the SAME colour language as the panel —
            green fill = pause engaged (matches the panel Pause button),
            amber fill = muted/silenced (mic AND speaker), solid red =
            disconnect only. Before, state here was icon-only and
            disconnect was a bare red icon. Neutral buttons carry
            .aspen-panel-btn so touch gets no lingering hover wash;
            filled state buttons don't (their same-hue hover is safe). */}
        <button type="button" className={stage3.suspended ? `${barButton} bg-primary text-primary-foreground hover:bg-primary/90` : `${barButton} aspen-panel-btn`} onClick={stage3.onToggleSuspend} title={stage3.suspended ? t("frame.resumeConversation") : t("frame.pauseConversation")} aria-label={stage3.suspended ? t("frame.resumeConversation") : t("frame.pauseConversation")} aria-pressed={stage3.suspended}>{stage3.suspended ? <Play className="h-[18px] w-[18px]" /> : <Pause className="h-[18px] w-[18px]" />}</button>
        <button type="button" className={`${barButton} bg-destructive text-destructive-foreground hover:bg-destructive/90`} onClick={stage3.onEnd} title={t("frame.disconnect")} aria-label={t("frame.disconnect")}><PhoneOff className="h-[18px] w-[18px]" /></button>
        <button type="button" className={stage3.muted ? `${barButton} bg-warning text-warning-foreground hover:bg-warning/90` : `${barButton} aspen-panel-btn`} onClick={stage3.onToggleMic} title={stage3.muted ? t("frame.unmuteMic") : t("frame.muteMic")} aria-label={stage3.muted ? t("frame.unmuteMic") : t("frame.muteMic")} aria-pressed={stage3.muted}>{stage3.muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}</button>
        <button type="button" className={stage3.speakerMuted ? `${barButton} bg-warning text-warning-foreground hover:bg-warning/90` : `${barButton} aspen-panel-btn`} onClick={stage3.onToggleSpeaker} title={stage3.speakerMuted ? t("frame.speakerOn") : t("frame.silenceSpeaker")} aria-label={stage3.speakerMuted ? t("frame.speakerOn") : t("frame.silenceSpeaker")} aria-pressed={stage3.speakerMuted}>{stage3.speakerMuted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}</button>
        <button type="button" className={`${barButton} aspen-panel-btn disabled:opacity-40`} onClick={stage3.onReplay} disabled={!stage3.hasReplay || stage3.replaying} title={t("frame.replay")} aria-label={t("frame.replay")}><RotateCcw className="h-[18px] w-[18px]" /></button>
        <button type="button" className={`${barButton} aspen-panel-btn`} onClick={onOpen} title={t("frame.maximize")} aria-label={t("frame.maximize")}><Maximize2 className="h-[18px] w-[18px]" /></button>
      </div>
    </div>}
    {/* Publish #56 layout fix: the portrait (livebox) is the first
        child of this wrapper and the panel stacks below it; when the
        panel's rows push the content past the shell's height cap,
        any scroll of this wrapper (touch drag on the panel body,
        wheel) slides the portrait up out of the frame — the owner's
        "dragging chops her head" — and nothing ever scrolled it
        back. Scrolling this wrapper is never a deliberate gesture
        (the caption box and the transcript scroll INTERNALLY), so
        pin it to the top: the portrait stays whole, ending at the
        panel's top border, at every drag position. The class string
        stays byte-identical (the viewport-fit test pins it). */}
    {!(open && mode === 'chat') && <div className={open ? 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain' : keepRendered ? 'aspen-prewarm-offscreen' : 'hidden'} aria-hidden={!open || undefined} onScroll={(event) => { if (event.currentTarget.scrollTop !== 0) event.currentTarget.scrollTop = 0; }}>{children}</div>}
    {open && <p className="shrink-0 text-center text-[10px] leading-tight text-muted-foreground">Calls are recorded</p>}
  </section>;
}
