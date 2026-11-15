import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { confirmedVisitorContact, contactReadback } from '../../supabase/functions/_shared/visitor-followup';
export interface VoiceAction { id: string; action: string; contact?: { name: string; email: string; phone: string }; slotStart?: string }
export default function VoiceActionConfirmation({ action, onAnswer }: { action: VoiceAction; onAnswer: (approved: boolean, contact?: unknown) => void }) {
  const { t } = useTranslation();
  const [contact, setContact] = useState(action.contact || { name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [error, setError] = useState('');
  const appointment = action.action === 'request_platform_appointment';
  const copy = action.action === 'request_conversation_copy';
  const spelling = contactReadback(contact);
  // Publish #65: the appointment card carries its own texting opt-in,
  // shown only when there is a number to text. It starts UNTICKED —
  // the same honest opt-in rule as every other consent surface — and
  // rides the confirm payload as smsConsent, separate from the
  // appointment-confirmation box above it.
  const showSmsOptIn = appointment && contact.phone.trim().length > 0;
  const confirm = () => {
    try {
      const valid = confirmedVisitorContact({ ...contact, consent });
      // Only the appointment payload gains smsConsent; the follow-up
      // and copy cards keep their existing payload shape, where
      // consent means contact permission, never texting permission.
      onAnswer(true, appointment ? { ...valid, consent: true, smsConsent } : { ...valid, consent: true });
    } catch (e) { setError(e instanceof Error ? e.message : t('card.checkDetails')); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onAnswer(false); }}>
    {/* Publish #65 (owner's phone report): the old card was one
        scrolling block — on a phone the built-in close was a 16px
        glyph he could not find and the action buttons fell below the
        fold, so the only way out was tapping outside the card. The
        card is now a flex column: a scrolling body and a sticky
        footer that keeps Not now / Confirm on screen at all times,
        plus our own finger-sized close button (the built-in Radix
        close is hidden via [&>button]:hidden — the sidebar pattern —
        so exactly one close control shows). */}
    <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-24px)] max-w-sm flex-col gap-0 overflow-hidden p-0 [&>button]:hidden">
      <div className="absolute right-2 top-2 z-20">
        <button type="button" aria-label={t('card.close')} onClick={() => onAnswer(false)} className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 pb-4">
        <DialogTitle className="pr-10">{copy ? t('card.titleCopy') : appointment ? t('card.titleAppointment') : t('card.titleFollowup')}</DialogTitle>
        <DialogDescription className="pr-10">{copy ? t('card.descCopy') : t('card.descSales')}</DialogDescription>
        {appointment && <p className="text-sm font-semibold">{action.slotStart && new Date(action.slotStart).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}</p>}
        {/* Publish #56: the appointment card arrives pre-filled from the
            voice-confirmed contact, but it LOOKS like a form — the owner
            objected ("You already have my email") when Aspen bounced him
            to it after a verbal slot pick. Say plainly that there is
            nothing to fill in: the one tap IS the finish. */}
        {appointment && <p className="text-xs text-muted-foreground">{t('card.prefilledNote')}</p>}
        <label className="text-xs">{t('card.nameLabel')}<Input aria-label={t('card.nameAria')} value={contact.name} maxLength={100} onChange={e => setContact({ ...contact, name: e.target.value })} disabled={appointment}/></label>
        <label className="text-xs">{t('card.emailLabel')}<Input aria-label={t('card.emailAria')} type="email" value={contact.email} maxLength={255} onChange={e => setContact({ ...contact, email: e.target.value })} disabled={appointment}/></label>
        {!copy && <label className="text-xs">{t('card.phoneLabel')}<Input aria-label={t('card.phoneAria')} type="tel" value={contact.phone} maxLength={30} onChange={e => setContact({ ...contact, phone: e.target.value })} disabled={appointment}/></label>}
        {!appointment && <div className="space-y-1 border-y border-border py-2 text-xs text-muted-foreground"><p className="break-words">{t('card.nameSpelling')} {spelling.name}</p><p className="break-words">{t('card.emailSpelling')} {spelling.email}</p>{spelling.phone && <p className="break-words">{t('card.phoneDigits')} {spelling.phone}</p>}</div>}
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>{copy ? t('card.consentCopy') : appointment ? t('card.consentAppointment', { defaultValue: 'I confirm this appointment with AI Hidden Leads.' }) : t('card.consentFollowup')}</label>
        {showSmsOptIn && <label className="flex items-start gap-2 text-xs"><input type="checkbox" aria-label={t('card.smsLabel', { defaultValue: 'Text me this confirmation' })} checked={smsConsent} onChange={e => setSmsConsent(e.target.checked)}/>{t('card.smsLabel', { defaultValue: 'Text me this confirmation' })}</label>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="sticky bottom-0 z-10 flex gap-2 border-t border-border bg-background px-6 py-4">
        <Button variant="outline" onClick={() => onAnswer(false)}>{t('card.notNow')}</Button>
        <Button onClick={confirm}>{appointment ? t('card.confirmAppointment') : t('card.confirmSave')}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
