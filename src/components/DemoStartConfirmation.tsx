import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DEMO_CONSENT_DISCLOSURE, looksLikeDomain, normalizeDemoUrl } from '@/lib/demoVerification';
import type { VoiceAction } from './VoiceActionConfirmation';

export interface DemoStartValues { websiteUrl: string; name: string; email: string }

/**
 * Voice demo-start confirmation (2026-11-21, homepage-test items
 * 9 + 10). When a homepage visitor agrees to the free demo and tells
 * Aspen their website, she has no form of her own for the address —
 * this is it: the heard URL pre-filled and correctable in place,
 * name/email pre-filled when the conversation already captured them.
 *
 * Consent is the Verified Demo Gate's disclosure-by-continuing: the
 * gate disclosure prints on the card and the "Start my demo" tap IS
 * the consent — there is deliberately NO checkbox (a voice visitor
 * must never be sent hunting for one mid-call).
 *
 * The card persists until the visitor explicitly submits or
 * dismisses it: Escape, outside taps and focus/keyboard churn are
 * swallowed (the follow-up card's cancel-and-forget behavior is the
 * item-5 defect, not a pattern to copy), and the layout tracks
 * visualViewport so the card — and its sticky action footer — stays
 * above the phone keyboard while the visitor edits the address.
 */
export default function DemoStartConfirmation({ action, onAnswer }: { action: VoiceAction; onAnswer: (approved: boolean, demo?: DemoStartValues) => void }) {
  const { t } = useTranslation();
  const [websiteUrl, setWebsiteUrl] = useState(action.demo?.websiteUrl || '');
  const [name, setName] = useState(action.demo?.name || '');
  const [email, setEmail] = useState(action.demo?.email || '');
  const [error, setError] = useState('');
  // visualViewport: the visible height/offset with the soft keyboard
  // open. Null on browsers without it — the dvh fallback then rules.
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const update = () => setViewport({ height: view.height, offsetTop: view.offsetTop });
    update();
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, []);

  const confirm = () => {
    if (!looksLikeDomain(websiteUrl)) { setError(t('card.urlInvalid')); return; }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) { setError(t('card.emailInvalid')); return; }
    onAnswer(true, { websiteUrl: normalizeDemoUrl(websiteUrl), name: name.trim(), email: trimmedEmail });
  };

  return (
    <Dialog open onOpenChange={() => { /* Only the explicit buttons close this card. */ }}>
      <DialogContent
        className="flex w-[calc(100vw-24px)] max-w-sm flex-col gap-0 overflow-hidden p-0 [&>button]:hidden"
        style={viewport ? { top: `${viewport.offsetTop + viewport.height / 2}px`, maxHeight: `${Math.max(300, viewport.height - 16)}px` } : { maxHeight: '85dvh' }}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="absolute right-2 top-2 z-20">
          <button type="button" aria-label={t('card.close')} onClick={() => onAnswer(false)} className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 pb-4">
          <DialogTitle className="pr-10">{t('card.titleDemo')}</DialogTitle>
          <DialogDescription className="pr-10">{t('card.descDemo')}</DialogDescription>
          <label className="text-xs">{t('card.urlLabel')}
            <Input aria-label={t('card.urlAria')} value={websiteUrl} maxLength={255} autoFocus inputMode="url" autoCapitalize="none" autoCorrect="off" onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="yourbusiness.com" />
          </label>
          <label className="text-xs">{t('card.nameLabel')}
            <Input aria-label={t('card.nameAria')} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-xs">{t('card.emailLabel')}
            <Input aria-label={t('card.emailAria')} type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {/* Disclosure-by-continuing, the Verified Demo Gate's model:
              the text is the consent record (the server stamps its
              version when the gate code is sent) — shown, never boxed. */}
          <p className="text-[11px] leading-snug text-muted-foreground">{DEMO_CONSENT_DISCLOSURE}</p>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="sticky bottom-0 z-10 flex gap-2 border-t border-border bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onAnswer(false)}>{t('card.notNow')}</Button>
          <Button onClick={confirm}>{t('card.confirmDemo')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
