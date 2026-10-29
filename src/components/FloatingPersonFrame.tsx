import type { ReactNode } from 'react';
import { MessageSquare, Mic, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import aspenPortrait from '@/assets/aspen-transparent-512.webp';

export function PersonPortrait({ name = 'Aspen', avatarUrl }: { name?: string; avatarUrl?: string }) {
  return <img src={avatarUrl || aspenPortrait} alt={name} width={512} height={512} decoding="async" draggable={false} className="aspen-person-portrait mx-auto object-contain" />;
}

export default function FloatingPersonFrame({ name = 'Aspen', avatarUrl, open, mode, onOpen, onMinimize, onClose, onMode, children }: {
  name?: string; avatarUrl?: string; open: boolean; mode: 'voice' | 'chat';
  onOpen: () => void; onMinimize: () => void; onClose: () => void; onMode: (mode: 'voice' | 'chat') => void; children?: ReactNode;
}) {
  return <section aria-label={`${name} floating assistant`} className={`aspen-person-shell ${open ? 'aspen-person-expanded' : 'aspen-person-collapsed'}`}>
    <div className="flex shrink-0 justify-end gap-1">
      {open && <Button size="icon" variant="ghost" className="h-8 w-8 bg-background/80 text-foreground" onClick={onMinimize} title="Minimize assistant" aria-label="Minimize assistant"><Minus className="h-4 w-4" /></Button>}
      <Button size="icon" variant="ghost" className="h-8 w-8 bg-background/80 text-foreground" onClick={onClose} title="Close assistant" aria-label="Close assistant"><X className="h-4 w-4" /></Button>
    </div>
    {(!open || mode === 'chat') && <PersonPortrait name={name} avatarUrl={avatarUrl} />}
    {!open && <Button onClick={onOpen} aria-label={`Talk to ${name}`} className="mx-auto h-auto min-h-10 max-w-full whitespace-normal px-4 py-2 text-sm">Talk to {name}</Button>}
    {open && <>
      <div className="mx-auto flex shrink-0 gap-1" aria-label="Conversation mode">
        <Button size="sm" variant={mode === 'voice' ? 'default' : 'outline'} aria-pressed={mode === 'voice'} onClick={() => onMode('voice')}><Mic className="h-3.5 w-3.5" />Voice</Button>
        <Button size="sm" variant={mode === 'chat' ? 'default' : 'outline'} aria-pressed={mode === 'chat'} onClick={() => onMode('chat')}><MessageSquare className="h-3.5 w-3.5" />Chat</Button>
      </div>
      {children}
    </>}
  </section>;
}