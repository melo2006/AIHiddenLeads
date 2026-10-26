import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { confirmedVisitorContact } from '../../supabase/functions/_shared/visitor-followup';
export interface VoiceAction { id: string; action: string; contact?: { name: string; email: string; phone: string }; slotStart?: string }
export default function VoiceActionConfirmation({ action, onAnswer }: { action: VoiceAction; onAnswer: (approved: boolean, contact?: unknown) => void }) {
  const [contact, setContact] = useState(action.contact || { name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const appointment = action.action === 'request_platform_appointment';
  const confirm = () => {
    try {
      const valid = confirmedVisitorContact({ ...contact, consent });
      onAnswer(true, { ...valid, consent: true });
    } catch (e) { setError(e instanceof Error ? e.message : 'Check your details.'); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onAnswer(false); }}><DialogContent className="max-h-[85dvh] w-[calc(100vw-24px)] max-w-sm overflow-y-auto">
    <DialogTitle>{appointment ? 'Confirm sales appointment' : 'Confirm your follow-up details'}</DialogTitle>
    <DialogDescription>AI Hidden Leads sales team · not the simulated business</DialogDescription>
    {appointment && <p className="text-sm font-semibold">{action.slotStart && new Date(action.slotStart).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}</p>}
    <label className="text-xs">First and last name<Input aria-label="Confirmed full name" value={contact.name} maxLength={100} onChange={e => setContact({ ...contact, name: e.target.value })} disabled={appointment}/></label>
    <label className="text-xs">Email<Input aria-label="Confirmed email" type="email" value={contact.email} maxLength={255} onChange={e => setContact({ ...contact, email: e.target.value })} disabled={appointment}/></label>
    <label className="text-xs">Phone (optional)<Input aria-label="Confirmed phone" type="tel" value={contact.phone} maxLength={30} onChange={e => setContact({ ...contact, phone: e.target.value })} disabled={appointment}/></label>
    <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>{appointment ? 'I confirm this appointment with AI Hidden Leads.' : 'These details are correct and I allow a sales specialist to contact me about this demo.'}</label>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex gap-2"><Button variant="outline" onClick={() => onAnswer(false)}>Not now</Button><Button onClick={confirm}>{appointment ? 'Confirm appointment' : 'Confirm & save'}</Button></div>
  </DialogContent></Dialog>;
}