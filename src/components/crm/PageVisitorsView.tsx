import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, MessageSquare, ChevronDown, ChevronUp, Clock, User, Mail } from 'lucide-react';
import { toast } from 'sonner';
import CallReportActions from './CallReportActions';
import {
  channelLabel, countByChannel, estimateSessionCost, filterVisitorRows, formatUsd,
  formatVisitorDuration, groupVisitorsByDay, hasRecordingSegments, mergeVisitorRecords,
  todaySubtotal, transcriptTurnCount,
  type SessionCost, type VisitorChannelFilter, type VisitorRecordDetail,
  type VisitorRecordListItem, type VisitorRow, type VoicePricing, type VoiceSessionUsage,
} from '@/lib/pageVisitors';

// Page Visitors — one home for every homepage visitor conversation with
// Aspen, voice AND typed chat. Both channels already live in
// conversation_records (see src/lib/pageVisitors.ts); this view reads
// them through the same conversation-records function the Private
// conversation records section uses, joins voice rows to their measured
// gemini_voice_sessions usage for cost estimates, and changes nothing
// about capture. Demo History keeps its own untouched copy of the data.

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function CostBreakdown({ cost, channel }: { cost: SessionCost; channel: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Estimated cost</p>
      {cost.totalUsd == null ? (
        <p className="text-[11px] text-muted-foreground italic">No measurable usage recorded for this conversation.</p>
      ) : (
        <div className="space-y-0.5 text-xs max-w-xs">
          {cost.geminiUsd != null && (
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">{channel === 'chat' ? 'Gemini chat' : 'Gemini voice'}</span>
              <span>{formatUsd(cost.geminiUsd)}</span>
            </div>
          )}
          {cost.simliUsd != null && (
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Simli video avatar</span>
              <span>{formatUsd(cost.simliUsd)}</span>
            </div>
          )}
          <div className="flex justify-between gap-6 border-t border-border pt-0.5 font-semibold">
            <span>Total est.</span>
            <span>{formatUsd(cost.totalUsd)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground pt-0.5">
            {cost.basis === 'measured'
              ? 'Priced from recorded audio at published rates. Estimate only — not a provider invoice.'
              : 'Duration-based estimate at measured average rates. Estimate only — not a provider invoice.'}
          </p>
        </div>
      )}
    </div>
  );
}

const VisitorCard = ({ row, cost, displayDuration }: { row: VisitorRow; cost: SessionCost; displayDuration: number | null }) => {
  const [expanded, setExpanded] = useState(false);
  const [override, setOverride] = useState<VisitorRecordDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const { data: fetched, isLoading: detailLoading } = useQuery({
    queryKey: ['page-visitor', row.id],
    enabled: expanded,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('conversation-records', { body: { action: 'read', id: row.id } });
      if (error) throw error;
      return data.record as VisitorRecordDetail;
    },
  });
  const detail = override ?? fetched ?? null;

  async function summarize() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('conversation-records', { body: { action: 'summarize', id: row.id } });
      if (error) throw error;
      setOverride(data.record as VisitorRecordDetail);
      void queryClient.invalidateQueries({ queryKey: ['page-visitors'] });
    } catch {
      toast.error('Could not generate summary');
    } finally {
      setBusy(false);
    }
  }

  const summaryStatus = detail?.summary_status ?? row.summaryStatus;
  const canSummarize = !(busy || summaryStatus === 'blocked' || summaryStatus === 'failed' || summaryStatus === 'generating');

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
          {row.channel === 'chat'
            ? <MessageSquare className="h-4 w-4 text-primary" />
            : <Phone className="h-4 w-4 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{row.businessName}</p>
            <Badge variant="outline" className="text-[10px]">{channelLabel(row.channel)}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{row.visitorName || 'Anonymous visitor'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatVisitorDuration(displayDuration)}
          </div>
          <span className="hidden md:inline text-[11px] text-muted-foreground">{formatDate(row.createdAt)}</span>
          <span className="text-xs font-semibold" title="Estimated total cost">{formatUsd(cost.totalUsd)}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {detailLoading && !detail ? (
            <p className="text-sm text-muted-foreground">Loading conversation…</p>
          ) : !detail ? (
            <p role="alert" className="text-sm text-muted-foreground">Conversation unavailable.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <CallReportActions records={[detail]} />
                <span className="text-[11px] text-muted-foreground">{formatDate(row.createdAt)} · {channelLabel(row.channel)}</span>
              </div>

              <CostBreakdown cost={cost} channel={row.channel} />

              {(detail.recipient_name || detail.recipient_email) && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Visitor</p>
                  <div className="space-y-0.5 text-xs">
                    {detail.recipient_name && <p className="flex items-center gap-1"><User className="h-3 w-3" />{detail.recipient_name}</p>}
                    {detail.recipient_email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{detail.recipient_email}</p>}
                  </div>
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Summary</p>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={!canSummarize} onClick={() => void summarize()}>
                    Generate AI summary
                  </Button>
                </div>
                <p className="text-sm">{detail.summary?.summary || 'No AI summary yet.'}</p>
                {detail.summary_error && <p role="alert" className="text-xs text-destructive mt-1">{detail.summary_error}</p>}
                {detail.summary?.needs?.length ? (
                  <p className="text-xs text-muted-foreground mt-1">Needs: {detail.summary.needs.join(' · ')}</p>
                ) : null}
                {detail.summary?.nextSteps?.length ? (
                  <p className="text-xs text-muted-foreground mt-1">Next steps: {detail.summary.nextSteps.join(' · ')}</p>
                ) : null}
              </div>

              {row.channel === 'voice' && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Recording</p>
                  {hasRecordingSegments(detail) ? (
                    <div className="space-y-2">
                      {detail.audio?.map((segment, i) => (
                        <div key={i}>
                          <p className="text-[11px] text-muted-foreground">{segment.speaker} · segment {i + 1}</p>
                          <audio controls preload="none" src={segment.url} className="w-full h-8" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">No recording segments were saved for this conversation.</p>
                  )}
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Transcript · {transcriptTurnCount(detail)} turn{transcriptTurnCount(detail) !== 1 ? 's' : ''}
                </p>
                {detail.transcript?.length ? (
                  <div className="bg-muted/30 rounded-lg p-3 max-h-60 overflow-y-auto space-y-1">
                    {detail.transcript.map((turn, i) => (
                      <p key={i} className="whitespace-pre-wrap text-xs">
                        <strong className="capitalize">{turn.role}: </strong>
                        <span className="text-foreground/80">{turn.text}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">No transcript saved.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const PageVisitorsView = () => {
  const [filter, setFilter] = useState<VisitorChannelFilter>('all');

  const { data: records, isLoading, error } = useQuery({
    queryKey: ['page-visitors'],
    queryFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke('conversation-records', { body: { action: 'list' } });
      if (invokeError) throw invokeError;
      return (data.records ?? []) as VisitorRecordListItem[];
    },
  });

  // Measured voice usage + the published pricing snapshot, from the same
  // voice-agents usage action Voice Usage & Costs reads. Failure here
  // only degrades costs to duration-based estimates — never the list.
  const { data: usageData } = useQuery({
    queryKey: ['page-visitors-usage'],
    retry: false,
    queryFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke('voice-agents', { body: { action: 'usage' } });
      if (invokeError) throw invokeError;
      return data as { sessions: VoiceSessionUsage[]; pricing: VoicePricing | null };
    },
  });

  // Simli-active proof: the usage ledger's video_avatar events, read
  // directly like Usage Reports does. Presence of an event for a
  // session means the video avatar ran; its minutes price the Simli line.
  const { data: simliMinutes } = useQuery({
    queryKey: ['page-visitors-simli'],
    retry: false,
    queryFn: async () => {
      const { data, error: selectError } = await supabase
        .from('usage_events')
        .select('source_id,quantity_minutes')
        .eq('source_table', 'gemini_voice_sessions')
        .eq('service', 'video_avatar')
        .order('occurred_at', { ascending: false })
        .limit(1000);
      if (selectError) throw selectError;
      const map = new Map<string, number>();
      for (const event of data ?? []) {
        const minutes = typeof event.quantity_minutes === 'number' ? event.quantity_minutes : Number(event.quantity_minutes);
        if (event.source_id && Number.isFinite(minutes) && !map.has(event.source_id)) map.set(event.source_id, minutes);
      }
      return map;
    },
  });

  const rows = useMemo(() => mergeVisitorRecords(records), [records]);
  const counts = useMemo(() => countByChannel(rows), [rows]);

  const usageBySession = useMemo(() => {
    const map = new Map<string, VoiceSessionUsage>();
    for (const session of usageData?.sessions ?? []) map.set(session.id, session);
    return map;
  }, [usageData]);

  const costFor = useMemo(() => {
    const pricing = usageData?.pricing ?? null;
    return (row: VisitorRow): SessionCost => {
      const voiceSession = row.voiceSessionId ? usageBySession.get(row.voiceSessionId) ?? null : null;
      return estimateSessionCost({
        channel: row.channel,
        durationSeconds: voiceSession?.duration_seconds ?? row.durationSeconds,
        voiceSession,
        pricing,
        videoAvatarMinutes: row.voiceSessionId ? simliMinutes?.get(row.voiceSessionId) ?? null : null,
      });
    };
  }, [usageBySession, usageData, simliMinutes]);

  const costs = useMemo(() => {
    const map = new Map<string, SessionCost>();
    for (const row of rows) map.set(row.id, costFor(row));
    return map;
  }, [rows, costFor]);

  const displayDurationFor = (row: VisitorRow): number | null =>
    (row.voiceSessionId ? usageBySession.get(row.voiceSessionId)?.duration_seconds : null) ?? row.durationSeconds;

  const filtered = useMemo(() => filterVisitorRows(rows, filter), [rows, filter]);
  const groups = useMemo(() => groupVisitorsByDay(filtered, costs), [filtered, costs]);
  const today = useMemo(() => todaySubtotal(filtered, costs), [filtered, costs]);

  const filterButton = (value: VisitorChannelFilter, label: string) => (
    <Button
      key={value}
      size="sm"
      variant={filter === value ? 'secondary' : 'ghost'}
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
    >
      {label}
    </Button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Page Visitors</h2>
        <p className="text-xs text-muted-foreground">
          Every conversation with Aspen on your pages — voice and typed chat — with transcripts, recordings and estimated cost.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm">
          Today so far: <strong>{formatUsd(today.totalUsd)}</strong> est. across {today.count} conversation{today.count !== 1 ? 's' : ''}
          {today.pricedCount < today.count && <span className="text-muted-foreground"> ({today.pricedCount} priced)</span>}
        </p>
        <p className="text-[11px] text-muted-foreground">Estimates only — not provider invoices.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {filterButton('all', `All (${rows.length})`)}
        {filterButton('voice', `Voice (${counts.voice})`)}
        {filterButton('chat', `Chat (${counts.chat})`)}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading conversations…</div>
      ) : error ? (
        <p role="alert" className="text-sm text-muted-foreground py-8 text-center">Conversations unavailable.</p>
      ) : !rows.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No page visitor conversations yet. Voice calls and typed chats with Aspen on your pages will appear here.
        </div>
      ) : !filtered.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {filter === 'voice' ? 'No voice conversations yet.' : 'No chat conversations yet.'}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
              <h3 className="text-sm font-semibold">{group.label}</h3>
              <p className="text-[11px] text-muted-foreground">
                {group.conversationCount} conversation{group.conversationCount !== 1 ? 's' : ''} · est. total{' '}
                <span className="font-semibold text-foreground">{formatUsd(group.totalUsd)}</span>
                {group.pricedCount < group.conversationCount && <> ({group.pricedCount} priced)</>}
              </p>
            </div>
            {group.rows.map((row) => (
              <VisitorCard
                key={row.id}
                row={row}
                cost={costs.get(row.id) ?? { geminiUsd: null, simliUsd: null, telephonyUsd: null, totalUsd: null, basis: 'none' }}
                displayDuration={displayDurationFor(row)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
};

export default PageVisitorsView;
