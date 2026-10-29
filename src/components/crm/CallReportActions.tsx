import { useState } from 'react';
import { Download, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { downloadCallReports, reportPayload, validateZapierUrl, type CallReport } from '@/lib/callReportExport';

export default function CallReportActions({ records, allowZapier = false }: { records: CallReport[]; allowZapier?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const record = records[0];
  async function send() {
    if (!record || records.length !== 1 || busy) return;
    setBusy(true);
    try {
      const destination = validateZapierUrl(url);
      await fetch(destination, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'call_report.reviewed', timestamp: new Date().toISOString(), triggered_from: window.location.origin, call: reportPayload(record) }),
      });
      toast.info('Request sent. Check your Zap’s run history to confirm delivery.');
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send to Zapier.');
    } finally { setBusy(false); }
  }
  return <div className="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" disabled={!records.length} onClick={() => downloadCallReports(records)}><Download className="mr-2 h-4 w-4"/>Download CSV</Button>
    {allowZapier && records.length === 1 && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Send className="mr-2 h-4 w-4"/>Send to Zapier</Button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogTitle>Review call report for Zapier</DialogTitle>
      <DialogDescription>This report goes to your Zap and any connected services. Recording links, full transcripts and private outreach drafts are excluded.</DialogDescription>
      {record && <dl className="space-y-2 break-words text-sm"><div><dt className="text-xs text-muted-foreground">Business</dt><dd>{record.business_name}</dd></div><div><dt className="text-xs text-muted-foreground">Caller</dt><dd>{record.caller_name || 'Not provided'} · {record.caller_email || 'No email'} · {record.caller_phone || 'No phone'}</dd></div><div><dt className="text-xs text-muted-foreground">Summary</dt><dd className="max-h-40 overflow-y-auto whitespace-pre-wrap">{reportPayload(record).summary || 'No summary yet'}</dd></div></dl>}
      <label className="space-y-1 text-xs">Zapier Catch Hook URL<Input type="url" autoComplete="off" aria-label="Zapier Catch Hook URL" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…"/></label>
      <p className="text-xs text-muted-foreground">Delivery must be confirmed in Zapier’s run history. Nothing sends automatically.</p>
      <Button disabled={busy || !url.trim()} onClick={() => void send()}><Send className="mr-2 h-4 w-4"/>{busy ? 'Sending…' : 'Confirm and send this report'}</Button>
    </DialogContent></Dialog>
  </div>;
}