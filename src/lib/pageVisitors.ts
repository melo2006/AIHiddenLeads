// Page Visitors — data shaping for the admin view that gives homepage
// visitor conversations one home. Both channels already persist in the
// SAME store: `conversation_records`, read through the existing
// `conversation-records` Edge function (list / read / summarize).
//   · voice — written by gemini-live-proxy checkpoints (channel 'voice',
//     audio segments in the conversation-recordings bucket)
//   · chat  — written per turn by the homepage ChatWidget through the
//     function's `chat` action (channel 'chat'), once the visitor agreed
// This module only normalizes that payload for display; it is not a
// second capture or storage path.
//
// Costs reuse the product's existing estimator: the shared
// `audioCost` from supabase/functions/_shared/voice-usage.ts applied to
// the recorded audio seconds with the published pricing snapshot (the
// exact logic Voice Usage & Costs uses), preferring the session's saved
// `audio_estimate_usd` when one exists. The existing estimator has NO
// Simli line (the usage ledger deliberately stores video_avatar events
// with est_cost_usd null), so the Simli line is added from plan facts:
// Simli Pro $49/mo ÷ 5,500 included minutes, amortized. Voice/chat
// duration fallbacks use the measured blended rates from Ron's
// 2026-11-15 cost breakdown (voice ≈ 2.4¢/min, chat ≈ 1.55¢/min).
// Every figure is an estimate, never a provider invoice.

import { audioCost, type VoicePricing } from '../../supabase/functions/_shared/voice-usage';

export type { VoicePricing };

/** Simli Pro: $49/mo for 5,500 minutes, amortized per minute. */
export const SIMLI_USD_PER_MINUTE = 49 / 5500;
/** Measured blended Gemini voice rate (fallback when a session has no
 *  recorded audio usage to price with the shared estimator). */
export const MEASURED_VOICE_USD_PER_MINUTE = 0.024;
/** Measured blended Gemini chat rate (typed chat has no audio usage). */
export const MEASURED_CHAT_USD_PER_MINUTE = 0.0155;

export type VisitorChannelFilter = 'all' | 'voice' | 'chat';

export interface VisitorRecordSummary {
  summary: string;
  needs?: string[];
  nextSteps?: string[];
  outreachDraft?: string;
}

/** One row of the conversation-records `list` payload. */
export interface VisitorRecordListItem {
  id: string;
  channel: string;
  business_name: string;
  status: string;
  summary_status: string;
  summary_error?: string | null;
  summary?: VisitorRecordSummary | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  session_ref?: string | null;
  created_at: string;
  ended_at?: string | null;
}

/** The `read` payload: the full record plus signed audio segment URLs. */
export interface VisitorRecordDetail extends VisitorRecordListItem {
  transcript?: { role: string; text: string }[] | null;
  audio?: { speaker: string; url: string }[];
}

export interface VisitorRow {
  id: string;
  channel: string;
  channelLabel: 'Voice' | 'Chat' | 'Conversation';
  businessName: string;
  visitorName: string | null;
  visitorEmail: string | null;
  /** gemini_voice_sessions id for voice records (from session_ref), else null. */
  voiceSessionId: string | null;
  createdAt: string;
  durationSeconds: number | null;
  summaryStatus: string;
  summaryText: string | null;
}

/** Voice records are keyed `gemini_<session id>` in session_ref. */
export function voiceSessionIdFromRef(sessionRef?: string | null): string | null {
  if (!sessionRef || !sessionRef.startsWith('gemini_')) return null;
  const id = sessionRef.slice('gemini_'.length);
  return id || null;
}

export function channelLabel(channel: string): VisitorRow['channelLabel'] {
  if (channel === 'voice') return 'Voice';
  if (channel === 'chat') return 'Chat';
  return 'Conversation';
}

/** Conversation span from the record's own timestamps; null while a
 *  record has no end stamp (or the stamps are unusable). */
export function visitorDurationSeconds(createdAt: string, endedAt?: string | null): number | null {
  if (!endedAt) return null;
  const start = Date.parse(createdAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

export function toVisitorRow(item: VisitorRecordListItem): VisitorRow {
  return {
    id: item.id,
    channel: item.channel,
    channelLabel: channelLabel(item.channel),
    businessName: item.business_name,
    visitorName: item.recipient_name?.trim() || null,
    visitorEmail: item.recipient_email?.trim() || null,
    voiceSessionId: voiceSessionIdFromRef(item.session_ref),
    createdAt: item.created_at,
    durationSeconds: visitorDurationSeconds(item.created_at, item.ended_at),
    summaryStatus: item.summary_status,
    summaryText: item.summary?.summary?.trim() || null,
  };
}

/** Normalize the list payload and order newest first. The function
 *  already orders by created_at desc; sorting here keeps the view
 *  correct even if a payload arrives unordered. */
export function mergeVisitorRecords(items: VisitorRecordListItem[] | null | undefined): VisitorRow[] {
  return (items ?? [])
    .map(toVisitorRow)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function filterVisitorRows(rows: VisitorRow[], filter: VisitorChannelFilter): VisitorRow[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => row.channel === filter);
}

export function countByChannel(rows: VisitorRow[]): { voice: number; chat: number } {
  return {
    voice: rows.filter((row) => row.channel === 'voice').length,
    chat: rows.filter((row) => row.channel === 'chat').length,
  };
}

export function formatVisitorDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function transcriptTurnCount(detail: VisitorRecordDetail | null | undefined): number {
  return detail?.transcript?.length ?? 0;
}

export function hasRecordingSegments(detail: VisitorRecordDetail | null | undefined): boolean {
  return Boolean(detail?.audio?.length);
}

// ---------------------------------------------------------------------------
// Per-conversation cost estimates (see the header note for sources).

/** The slice of a gemini_voice_sessions row the estimator needs — the
 *  same shape the voice-agents `usage` action returns. */
export interface VoiceSessionUsage {
  id: string;
  duration_seconds: number | null;
  usage: {
    model?: string;
    input_audio_seconds?: number;
    output_audio_seconds?: number;
    audio_estimate_usd?: number | null;
  } | null;
}

export interface SessionCostInput {
  channel: string;
  /** Record span (created→ended); used when no measured session exists. */
  durationSeconds: number | null;
  /** The joined gemini_voice_sessions row for voice records, if found. */
  voiceSession?: VoiceSessionUsage | null;
  /** Published pricing snapshot from the usage action. */
  pricing?: VoicePricing | null;
  /** Minutes from the usage ledger's video_avatar event for this
   *  session; null when the Simli avatar was not active (no event). */
  videoAvatarMinutes?: number | null;
}

export interface SessionCost {
  geminiUsd: number | null;
  simliUsd: number | null;
  /** Phone-path sessions only. Every record in this store is a browser
   *  session (voice or chat), so this line never applies here. */
  telephonyUsd: number | null;
  totalUsd: number | null;
  /** 'measured' = priced from recorded audio usage with the shared
   *  estimator; 'duration' = duration × measured blended rate;
   *  'none' = nothing measurable. */
  basis: 'measured' | 'duration' | 'none';
}

const minutesOf = (seconds: number | null | undefined): number =>
  seconds != null && seconds > 0 ? seconds / 60 : 0;

export function estimateSessionCost(input: SessionCostInput): SessionCost {
  const none: SessionCost = { geminiUsd: null, simliUsd: null, telephonyUsd: null, totalUsd: null, basis: 'none' };

  if (input.channel === 'chat') {
    if (input.durationSeconds == null) return none;
    const geminiUsd = minutesOf(input.durationSeconds) * MEASURED_CHAT_USD_PER_MINUTE;
    return { geminiUsd, simliUsd: null, telephonyUsd: null, totalUsd: geminiUsd, basis: 'duration' };
  }

  if (input.channel !== 'voice') return none;

  const session = input.voiceSession ?? null;
  const durationSeconds = session?.duration_seconds ?? input.durationSeconds;

  // Gemini line — Voice Usage & Costs' exact rule: the session's saved
  // estimate wins; otherwise price the recorded audio seconds with the
  // shared estimator and the published pricing snapshot.
  let geminiUsd: number | null = null;
  let basis: SessionCost['basis'] = 'none';
  const usage = session?.usage ?? null;
  if (usage?.audio_estimate_usd != null) {
    geminiUsd = usage.audio_estimate_usd;
    basis = 'measured';
  } else if (
    input.pricing && usage?.model === input.pricing.model &&
    typeof usage?.input_audio_seconds === 'number' && typeof usage?.output_audio_seconds === 'number'
  ) {
    geminiUsd = audioCost(usage.input_audio_seconds, usage.output_audio_seconds, input.pricing);
    basis = 'measured';
  } else if (durationSeconds != null && durationSeconds > 0) {
    geminiUsd = minutesOf(durationSeconds) * MEASURED_VOICE_USD_PER_MINUTE;
    basis = 'duration';
  }

  // Simli line — only when the usage ledger recorded a video_avatar
  // event for this session (the avatar was actually live).
  let simliUsd: number | null = null;
  if (input.videoAvatarMinutes != null && input.videoAvatarMinutes > 0) {
    simliUsd = input.videoAvatarMinutes * SIMLI_USD_PER_MINUTE;
  }

  if (geminiUsd == null && simliUsd == null) return none;
  return {
    geminiUsd,
    simliUsd,
    telephonyUsd: null,
    totalUsd: (geminiUsd ?? 0) + (simliUsd ?? 0),
    basis,
  };
}

/** USD formatting matching Voice Usage & Costs (4 decimals — session
 *  costs are sub-cent-per-minute scale). null renders as an em dash. */
export function formatUsd(value: number | null | undefined): string {
  return value == null ? '—' : `$${value.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Day grouping + subtotals (local calendar days, matching how Ron reads
// the list). Costs aggregate over whatever rows are passed in — the
// view passes the channel-filtered set, so subtotals follow the filter.

export interface VisitorDayGroup {
  key: string;
  label: string;
  rows: VisitorRow[];
  conversationCount: number;
  /** Sum of session totals that could be priced; null when none could. */
  totalUsd: number | null;
  pricedCount: number;
}

export function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabelOf(iso: string, now: Date = new Date()): string {
  const key = dayKeyOf(iso);
  if (key === dayKeyOf(now.toISOString())) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKeyOf(yesterday.toISOString())) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function groupVisitorsByDay(
  rows: VisitorRow[],
  costs: Map<string, SessionCost>,
  now: Date = new Date(),
): VisitorDayGroup[] {
  const groups = new Map<string, VisitorDayGroup>();
  for (const row of rows) {
    const key = dayKeyOf(row.createdAt);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: dayLabelOf(row.createdAt, now), rows: [], conversationCount: 0, totalUsd: null, pricedCount: 0 };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.conversationCount += 1;
    const total = costs.get(row.id)?.totalUsd;
    if (total != null) {
      group.totalUsd = (group.totalUsd ?? 0) + total;
      group.pricedCount += 1;
    }
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/** The "Today so far" strip: today's totals over the rows passed in. */
export function todaySubtotal(
  rows: VisitorRow[],
  costs: Map<string, SessionCost>,
  now: Date = new Date(),
): { count: number; totalUsd: number | null; pricedCount: number } {
  const todayKey = dayKeyOf(now.toISOString());
  let count = 0;
  let pricedCount = 0;
  let totalUsd: number | null = null;
  for (const row of rows) {
    if (dayKeyOf(row.createdAt) !== todayKey) continue;
    count += 1;
    const total = costs.get(row.id)?.totalUsd;
    if (total != null) {
      totalUsd = (totalUsd ?? 0) + total;
      pricedCount += 1;
    }
  }
  return { count, totalUsd, pricedCount };
}
