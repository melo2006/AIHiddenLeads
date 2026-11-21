import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import ConversationFormatted from '@/components/ConversationFormatted';
import type { TranscriptFragment } from '@/lib/conversationDetail';

// The private conversation-copy page behind the expiring hashed link
// (conversation-records `copy` action). Presentation lives in the
// shared ConversationFormatted renderer (banner → summary → merged
// turns → CTA → footer) so this page, the admin record views and the
// copy email all show the same formatted conversation.
export default function ConversationCopy() {
  const [record, setRecord] = useState<{ transcript: TranscriptFragment[]; summary?: unknown; summary_status: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const token = window.location.hash.slice(1);
    void supabase.functions.invoke('conversation-records', { body: { action: 'copy', token } }).then(({ data, error }) => {
      if (error) setError('This private link is unavailable or expired.');
      else setRecord(data.record);
    });
  }, []);
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-background p-6 text-foreground">
      {error
        ? <p role="alert">{error}</p>
        : !record
          ? <p>Loading private copy…</p>
          : <ConversationFormatted summary={record.summary} transcript={record.transcript} />}
    </main>
  );
}
