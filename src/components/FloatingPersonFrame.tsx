import type { ReactNode } from 'react';
import { MessageSquare, Mic, X, AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import aspenPortrait from '@/assets/aspen-video-frame-final.webp';
import aspenIdleBeckon from '@/assets/aspen-idle-wave.gif';

export function PersonPortrait({ name = 'Aspen', avatarUrl, animated = true }: { name?: string; avatarUrl?: string; animated?: boolean }) {
  const src = avatarUrl || (animated ? aspenIdleBeckon : aspenPortrait);
  return <img src={src} alt={name} width={512} height={512} decoding="async" draggable={false} className={`aspen-person-portrait mx-auto object-cover object-top ${animated ? 'aspen-portrait-idle' : ''}`} />;
}

/** Below her: minimize and close render under the portrait and the call panel
 * (drag lives on the shell). Voice/chat switching sits below the controls. */
export default function FloatingPersonFrame({ name = 'Aspen', avatarUrl, open, minimized = false, mode, onOpen, onMinimize, onClose, onMode, keepRendered = false, children }: {
  name?: string; avatarUrl?: string; open: boolean; minimized?: boolean; mode: 'voice' | 'chat';
  onOpen: () => void; onMinimize: () => void; onClose: () => void; onMode: (mode: 'voice' | 'chat') => void; keepRendered?: boolean; children?: ReactNode;
}) {
  const firstName = name?.trim().split(/\s+/)[0];
  const talkLabel = firstName ? `Talk to ${firstName}` : 'Talk to Me';
  // The minimized launcher shows the agent's own photo. avatarUrl comes from the
  // agent record; undefined means a platform (Aspen) surface with no tenant record,
  // which uses the same default portrait as PersonPortrait. A tenant record with no
  // photo ('') keeps the plain mic icon instead of borrowing Aspen's face.
  const launcherPhoto = avatarUrl === undefined ? aspenIdleBeckon : avatarUrl;
  return <section aria-label={`${name} floating assistant`} className={`aspen-person-shell relative ${open ? 'aspen-person-expanded' : 'aspen-person-collapsed'} ${!open && minimized ? '!w-24 items-center' : ''}`}>
    {open && mode === 'chat' && <PersonPortrait name={name} avatarUrl={avatarUrl} />}
    {!open && minimized && <Button variant="ghost" onClick={onOpen} title={talkLabel} aria-label={talkLabel} className="flex h-auto flex-col items-center gap-1 p-0 hover:bg-transparent">
      <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/60 bg-primary text-primary-foreground shadow-md">
        {launcherPhoto ? <img src={launcherPhoto} alt="" className="h-full w-full object-cover" draggable={false} /> : <Mic className="h-8 w-8" />}
      </span>
      <span className="w-fit rounded-md bg-card/90 px-1.5 text-center text-[10px] font-medium leading-tight text-muted-foreground">{talkLabel}</span>
    </Button>}
    {!open && !minimized && <>
      <Button variant="ghost" onClick={onOpen} title={`Talk to ${name}`} aria-label={`Talk to ${name}`} className="aspen-portrait-trigger relative mx-auto h-auto max-w-full p-0 [&_svg]:size-8"><PersonPortrait name={name} avatarUrl={avatarUrl} animated /><Mic className="absolute bottom-0 right-0 rounded-full bg-primary p-1.5 text-primary-foreground" /><span className="sr-only">Talk to {name}</span></Button>
      <p className="mx-auto w-fit rounded-md bg-card/90 px-1.5 text-center text-xs font-medium leading-tight text-foreground">{talkLabel}</p>
      <p className="mx-auto w-fit rounded-md bg-card/90 px-1.5 text-center text-[10px] leading-tight text-muted-foreground"><span className="aspen-hi-badge mr-1 font-semibold text-primary">&ldquo;Hi&rdquo;</span><span>Tap to talk · calls are recorded</span></p>
    </>}
    <div className={open ? 'min-h-0' : keepRendered ? 'aspen-prewarm-offscreen' : 'hidden'} aria-hidden={!open || undefined}>{children}</div>
    <div className="aspen-person-window-controls flex shrink-0 justify-end gap-1">

      {(open || !minimized) && <Button size="icon" variant="secondary" className="aspen-person-x-overlay h-8 w-8 border border-primary/60 bg-background/90 text-foreground" onClick={onMinimize} title="Minimize" aria-label="Minimize"><X className="h-4 w-4" /></Button>}
    </div>
    {open && <div className="mx-auto flex shrink-0 gap-1" aria-label="Conversation mode">
      {mode === 'chat' && <Button size="icon" className="h-8 w-8" title="Voice" aria-label="Voice" variant="outline" aria-pressed={false} onClick={() => onMode('voice')}><AudioLines className="h-3.5 w-3.5" /></Button>}
      <Button size="icon" className="h-8 w-8" title="Chat" aria-label="Chat" variant={mode === 'chat' ? 'default' : 'outline'} aria-pressed={mode === 'chat'} onClick={() => onMode('chat')}><MessageSquare className="h-3.5 w-3.5" /></Button>
    </div>}
  </section>;
}
