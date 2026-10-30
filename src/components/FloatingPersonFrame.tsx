import type { ReactNode } from 'react';
import { MessageSquare, Mic, Minus, X, Maximize2, AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import aspenPortrait from '@/assets/aspen-video-frame-final.webp.asset.json';

export function PersonPortrait({ name = 'Aspen', avatarUrl }: { name?: string; avatarUrl?: string }) {
  return <img src={avatarUrl || aspenPortrait.url} alt={name} width={512} height={512} decoding="async" draggable={false} className="aspen-person-portrait mx-auto object-contain" />;
}

/** Above her head: only minimize and close (drag lives on the shell). Voice/chat switching sits below the call panel. */
export default function FloatingPersonFrame({ name = 'Aspen', avatarUrl, open, mode, onOpen, onMinimize, onClose, onMode, children }: {
  name?: string; avatarUrl?: string; open: boolean; mode: 'voice' | 'chat';
  onOpen: () => void; onMinimize: () => void; onClose: () => void; onMode: (mode: 'voice' | 'chat') => void; children?: ReactNode;
}) {
  return <section aria-label={`${name} floating assistant`} className={`aspen-person-shell ${open ? 'aspen-person-expanded' : 'aspen-person-collapsed'}`}>
    <div className="aspen-person-window-controls sticky top-0 z-10 flex shrink-0 justify-end gap-1">
      <Button size="icon" variant="secondary" className="h-8 w-8 border border-primary/60 text-foreground" onClick={open ? onMinimize : onOpen} title={open ? 'Minimize assistant' : 'Expand assistant'} aria-label={open ? 'Minimize assistant' : 'Expand assistant'}>{open ? <Minus className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
      <Button size="icon" variant="secondary" className="h-8 w-8 border border-primary/60 text-foreground" onClick={onClose} title="Close assistant" aria-label="Close assistant"><X className="h-4 w-4" /></Button>
    </div>
    {open && mode === 'chat' && <PersonPortrait name={name} avatarUrl={avatarUrl} />}
    {!open && <>
      <Button variant="ghost" onClick={onOpen} title={`Talk to ${name}`} aria-label={`Talk to ${name}`} className="aspen-portrait-trigger relative mx-auto h-auto max-w-full p-0 [&_svg]:size-8"><PersonPortrait name={name} avatarUrl={avatarUrl} /><Mic className="absolute bottom-0 right-0 rounded-full bg-primary p-1.5 text-primary-foreground" /><span className="sr-only">Talk to {name}</span></Button>
      <p className="mx-auto w-fit rounded-md bg-card/90 px-1.5 text-center text-[10px] leading-tight text-muted-foreground">Tap to talk · calls are recorded</p>
    </>}
    <div className={open ? 'min-h-0' : 'hidden'}>{children}</div>
    {open && <div className="mx-auto flex shrink-0 gap-1" aria-label="Conversation mode">
      {mode === 'chat' && <Button size="icon" className="h-8 w-8" title="Voice" aria-label="Voice" variant="outline" aria-pressed={false} onClick={() => onMode('voice')}><AudioLines className="h-3.5 w-3.5" /></Button>}
      <Button size="icon" className="h-8 w-8" title="Chat" aria-label="Chat" variant={mode === 'chat' ? 'default' : 'outline'} aria-pressed={mode === 'chat'} onClick={() => onMode('chat')}><MessageSquare className="h-3.5 w-3.5" /></Button>
    </div>}
  </section>;
}
