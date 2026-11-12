// Usage Reporting Suite — frontend usage math (pure TS, no React, no supabase).
//
// Twin of supabase/functions/_shared/usage-reporting.ts: the reports engine,
// the admin Usage Reports page and the /account usage section must all agree
// on periods (UTC), aggregation, the rollover bank and thresholds. Keep the
// constants and rules in sync with that server module and with
// drizzle/migrations/0020_usage_reporting.sql.
//
// Rollover rule (Ron's): unused plan minutes bank month to month while
// subscribed; banked minutes expire after 90 days; cancel forfeits the bank.
import { csvCell } from './callReportExport';

export type UsageService = 'web_voice' | 'phone_voice' | 'chat_brain' | 'sms' | 'email' | 'video_avatar';
export type UsageProvider = 'gemini' | 'telnyx' | 'twilio' | 'simli' | 'hostinger' | 'resend' | 'other';

export interface UsageEvent {
  id: string;
  organization_id: string | null;
  agent_id: string | null;
  telephony_client_id: string | null;
  service: UsageService | string;
  provider: UsageProvider | string;
  line_number: string | null;
  quantity_minutes: number | string | null;
  quantity_count: number | null;
  est_cost_usd: number | string | null;
  carrier_cost_usd: number | string | null;
  source_table: string;
  source_id: string;
  occurred_at: string;
  created_at: string;
}

export interface UsageFilters {
  /** undefined = all clients; null = unattributed rows only. */
  organizationId?: string | null;
  service?: string;
  provider?: string;
  lineNumber?: string;
  from: string;
  to: string;
}

export const SERVICES: UsageService[] = ['web_voice', 'phone_voice', 'chat_brain', 'sms', 'email', 'video_avatar'];
export const PROVIDERS: UsageProvider[] = ['gemini', 'telnyx', 'twilio', 'simli', 'hostinger', 'resend', 'other'];

export const SERVICE_LABELS: Record<string, string> = {
  web_voice: 'Web voice (Aspen on your website)',
  phone_voice: 'Phone voice (Aspen answering calls)',
  chat_brain: 'Chat / website brain',
  sms: 'Text messages',
  email: 'Emails',
  video_avatar: 'Video avatar',
};

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  telnyx: 'Telnyx',
  twilio: 'Twilio',
  simli: 'Simli',
  hostinger: 'Hostinger',
  resend: 'Resend',
  other: 'Other',
};

/** Chart colours per service (hex, used by the admin stacked area chart). */
export const SERVICE_COLORS: Record<string, string> = {
  web_voice: '#10b981',
  phone_voice: '#3b82f6',
  video_avatar: '#a855f7',
  chat_brain: '#f59e0b',
  sms: '#ec4899',
  email: '#64748b',
};

// ---------------------------------------------------------------------------
// Plans + minute packs (mirror of backend PLAN_ALLOWANCES / MINUTE_PACKS)
// ---------------------------------------------------------------------------

export const PLAN_ALLOWANCES = {
  essentials_monthly: { name: 'Premium', monthlyUsd: 99, minutes: 400 },
  growth_monthly: { name: 'Professional', monthlyUsd: 199, minutes: 1200 },
  fullservice_monthly: { name: 'Platinum', monthlyUsd: 349, minutes: 2500 },
} as const;

export type PlanPriceId = keyof typeof PLAN_ALLOWANCES;

export function planForPriceId(priceId: string | null | undefined): (typeof PLAN_ALLOWANCES)[PlanPriceId] | null {
  if (!priceId) return null;
  return (PLAN_ALLOWANCES as Record<string, (typeof PLAN_ALLOWANCES)[PlanPriceId]>)[priceId] ?? null;
}

export interface MinutePack {
  id: string;
  kind: 'voice' | 'video';
  minutes: number;
  priceCents: number;
}

/** Voice packs ONLY — video packs stay unpriced (Simli cost unverified). */
export const MINUTE_PACKS: MinutePack[] = [
  { id: 'voice_100', kind: 'voice', minutes: 100, priceCents: 2000 },
  { id: 'voice_300', kind: 'voice', minutes: 300, priceCents: 5400 },
  { id: 'voice_500', kind: 'voice', minutes: 500, priceCents: 8500 },
  { id: 'voice_1000', kind: 'voice', minutes: 1000, priceCents: 15000 },
];

export interface MinutePackPurchase {
  id?: string;
  pack_id?: string;
  minutes: number;
  price_cents?: number;
  status: string;
  created_at: string;
}

export interface UsageReportSettings {
  id?: string;
  organization_id: string;
  cadence: 'off' | 'daily' | 'weekly' | 'monthly' | string;
  report_email: string | null;
  sms_alerts: boolean;
  alert_phone: string | null;
}

// ---------------------------------------------------------------------------
// Period helpers — all UTC, mirroring voiceUsageFilters' preset style.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 3600_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

export type RangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

export interface CustomRange { from?: string; to?: string }

/** [from, to] for a preset. `custom` dates are YYYY-MM-DD, read as UTC days. */
export function presetRange(preset: RangePreset, now = new Date(), custom?: CustomRange): { from: Date; to: Date } {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (preset) {
    case 'today': return { from: startOfToday, to: now };
    case '7d': return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
    case '30d': return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
    case 'month': return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: now };
    case 'custom': {
      const from = custom?.from ? new Date(`${custom.from}T00:00:00.000Z`) : startOfToday;
      const to = custom?.to ? new Date(`${custom.to}T23:59:59.999Z`) : now;
      return { from, to };
    }
  }
}

export function monthKeyFor(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Monday (UTC) of the ISO week containing `d`. */
export function mondayOfUtcWeek(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - dow * DAY_MS);
}

// ---------------------------------------------------------------------------
// Filtering + aggregation
// ---------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

export const isVoiceService = (service: string) => service === 'web_voice' || service === 'phone_voice';

export function filterUsageEvents(events: UsageEvent[], filters: UsageFilters): UsageEvent[] {
  const fromMs = Date.parse(filters.from);
  const toMs = Date.parse(filters.to);
  return (events || []).filter((e) => {
    const t = Date.parse(e.occurred_at);
    if (Number.isNaN(t) || t < fromMs || t > toMs) return false;
    if (filters.organizationId !== undefined && e.organization_id !== filters.organizationId) return false;
    if (filters.service && e.service !== filters.service) return false;
    if (filters.provider && e.provider !== filters.provider) return false;
    if (filters.lineNumber && e.line_number !== filters.lineNumber) return false;
    return true;
  });
}

export interface ServiceUsageTotals {
  minutes: number;
  /** Sum of quantity_count (messages, AI calls, emails…). */
  count: number;
  estCostUsd: number;
  carrierCostUsd: number;
  /** Number of ledger rows for this service. */
  events: number;
}

export interface UsageAggregate {
  byService: Record<string, ServiceUsageTotals>;
  totals: {
    /** web_voice + phone_voice minutes only — the minutes plans meter. */
    voiceMinutes: number;
    minutes: number;
    count: number;
    events: number;
    estCostUsd: number;
    carrierCostUsd: number;
  };
}

export function aggregateUsage(events: UsageEvent[]): UsageAggregate {
  const byService: Record<string, ServiceUsageTotals> = {};
  const totals = { voiceMinutes: 0, minutes: 0, count: 0, events: 0, estCostUsd: 0, carrierCostUsd: 0 };
  for (const e of events || []) {
    const svc = byService[e.service] ?? (byService[e.service] = { minutes: 0, count: 0, estCostUsd: 0, carrierCostUsd: 0, events: 0 });
    const minutes = num(e.quantity_minutes);
    svc.minutes += minutes;
    svc.count += num(e.quantity_count);
    svc.estCostUsd += num(e.est_cost_usd);
    svc.carrierCostUsd += num(e.carrier_cost_usd);
    svc.events += 1;
    totals.minutes += minutes;
    totals.count += num(e.quantity_count);
    totals.events += 1;
    totals.estCostUsd += num(e.est_cost_usd);
    totals.carrierCostUsd += num(e.carrier_cost_usd);
    if (isVoiceService(e.service)) totals.voiceMinutes += minutes;
  }
  for (const svc of Object.values(byService)) {
    svc.minutes = round3(svc.minutes);
    svc.estCostUsd = round6(svc.estCostUsd);
    svc.carrierCostUsd = round6(svc.carrierCostUsd);
  }
  totals.voiceMinutes = round3(totals.voiceMinutes);
  totals.minutes = round3(totals.minutes);
  totals.estCostUsd = round6(totals.estCostUsd);
  totals.carrierCostUsd = round6(totals.carrierCostUsd);
  return { byService, totals };
}

export type UsageBucket = { bucket: string; total: number } & Record<string, number | string>;

/**
 * Per-bucket per-service minute totals for stacked charts. Day buckets are
 * UTC YYYY-MM-DD; week buckets are keyed by their ISO Monday (UTC) date.
 * Every known service key is present (0 when absent) so stacks stay stable.
 */
export function bucketize(events: UsageEvent[], by: 'day' | 'week'): UsageBucket[] {
  const buckets = new Map<string, UsageBucket>();
  for (const e of events || []) {
    const d = new Date(e.occurred_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = by === 'day' ? dateKey(d) : dateKey(mondayOfUtcWeek(d));
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { bucket: key, total: 0 };
      for (const s of SERVICES) bucket[s] = 0;
      buckets.set(key, bucket);
    }
    const minutes = num(e.quantity_minutes);
    bucket[e.service] = num(bucket[e.service]) + minutes;
    bucket.total += minutes;
  }
  const rows = [...buckets.values()].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
  for (const row of rows) {
    for (const s of SERVICES) row[s] = round3(num(row[s]));
    row.total = round3(row.total);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Minute balance, pack balance, thresholds
// ---------------------------------------------------------------------------

export interface MinuteBalance {
  usedThisMonth: number;
  bankedMinutes: number;
  /** allowance + bank − used this month (negative when over). */
  remainingThisMonth: number;
}

/** Voice minutes per UTC calendar month (YYYY-MM keys), voice services only. */
export function voiceMinutesByMonth(events: UsageEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events || []) {
    if (!isVoiceService(e.service)) continue;
    const key = monthKeyFor(e.occurred_at);
    out.set(key, (out.get(key) ?? 0) + num(e.quantity_minutes));
  }
  return out;
}

export function computeMinuteBalance(input: {
  allowanceMinutes: number;
  events: UsageEvent[];
  now?: Date;
  subscriptionActive: boolean;
}): MinuteBalance {
  const { allowanceMinutes, subscriptionActive } = input;
  const now = input.now ?? new Date();
  const byMonth = voiceMinutesByMonth(input.events || []);
  const currentKey = monthKeyFor(now);
  const usedThisMonth = round3(byMonth.get(currentKey) ?? 0);
  let banked = 0;
  if (subscriptionActive && allowanceMinutes > 0) {
    // Walk prior months; a month banks only while its month-end (the first
    // instant of the following month) is within 90 days of `now`.
    const [y, mo] = currentKey.split('-').map(Number);
    for (let back = 1; back <= 12; back++) {
      const monthStart = new Date(Date.UTC(y, mo - 1 - back, 1));
      const monthEnd = new Date(Date.UTC(y, mo - back, 1)); // first instant after that month
      const ageMs = now.getTime() - monthEnd.getTime();
      if (ageMs < 0) continue;
      if (ageMs > 90 * DAY_MS) break; // older months are only older still
      const used = byMonth.get(monthKeyFor(monthStart)) ?? 0;
      banked += Math.max(0, allowanceMinutes - used);
    }
  }
  const bankedMinutes = round3(banked);
  return {
    usedThisMonth,
    bankedMinutes,
    remainingThisMonth: round3(allowanceMinutes + bankedMinutes - usedThisMonth),
  };
}

/** Minutes from paid packs bought in the last 90 days (packs expire at 90 days). */
export function packBalance(purchases: MinutePackPurchase[], now = new Date()): number {
  const cutoff = now.getTime() - 90 * DAY_MS;
  let total = 0;
  for (const p of purchases || []) {
    if (p.status !== 'paid' && p.status !== 'paid_test') continue;
    const t = Date.parse(p.created_at);
    if (Number.isNaN(t) || t < cutoff || t > now.getTime()) continue;
    total += num(p.minutes);
  }
  return total;
}

export function thresholdPct(used: number, allowance: number): number {
  if (!allowance || allowance <= 0 || !Number.isFinite(used)) return 0;
  return (used / allowance) * 100;
}

export type ThresholdState = 'ok' | 'warn80' | 'over100';

export function thresholdState(used: number, allowance: number): ThresholdState {
  const pct = thresholdPct(used, allowance);
  if (pct >= 100) return 'over100';
  if (pct >= 80) return 'warn80';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Sample-data preview (client-side ONLY)
//
// Deterministic sample dataset for the /account empty state: a new client
// with no usage yet can preview what their dashboard will look like. HARD
// RULES: generated in the browser from a fixed seed (stable across renders),
// NEVER written to Supabase, and in preview mode it REPLACES the display
// dataset — it is never merged with real query results. Every id is
// prefixed `sample-` and source_table is 'sample_preview', so sample rows
// can never be mistaken for ledger rows.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleUsageOptions {
  organizationId: string | null;
  /** The client's real plan allowance, so sample usage sits in a sensible
   *  proportion of it (defaults to the Premium 400 when unknown). */
  allowanceMinutes?: number;
  now?: Date;
}

export function sampleUsageEvents(options: SampleUsageOptions): UsageEvent[] {
  const now = options.now ?? new Date();
  const allowance = options.allowanceMinutes && options.allowanceMinutes > 0 ? options.allowanceMinutes : 400;
  const rand = mulberry32(0x5eed);
  const events: UsageEvent[] = [];
  let seq = 0;

  const push = (partial: Partial<UsageEvent> & { occurred_at: string }) => {
    seq += 1;
    events.push({
      id: `sample-${seq}`,
      organization_id: options.organizationId,
      agent_id: null,
      telephony_client_id: null,
      service: 'web_voice',
      provider: 'gemini',
      line_number: null,
      quantity_minutes: null,
      quantity_count: null,
      est_cost_usd: null,
      carrier_cost_usd: null,
      source_table: 'sample_preview',
      source_id: `sample-${seq}`,
      created_at: partial.occurred_at,
      ...partial,
    });
  };

  // Voice events for one month, scaled so the month's voice minutes land at
  // `targetShare` of the allowance. Returns nothing; minutes are written
  // onto the events directly.
  const voiceMonth = (monthOffset: number, phoneCalls: number, webSessions: number, targetShare: number) => {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthOffset, 1));
    const daysInMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    const maxDay = monthOffset === 0 ? Math.max(1, now.getUTCDate()) : daysInMonth;
    const made: UsageEvent[] = [];
    const addVoice = (service: 'phone_voice' | 'web_voice', count: number) => {
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(rand() * maxDay);
        const at = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day, 8 + Math.floor(rand() * 12), Math.floor(rand() * 60)));
        if (at.getTime() > now.getTime()) at.setTime(now.getTime() - Math.floor(rand() * 3600000));
        seq += 1;
        const event: UsageEvent = {
          id: `sample-${seq}`,
          organization_id: options.organizationId,
          agent_id: null,
          telephony_client_id: null,
          service,
          provider: service === 'phone_voice' ? 'telnyx' : 'gemini',
          line_number: service === 'phone_voice' ? '+18778624949' : null,
          quantity_minutes: 2 + rand() * 7,
          quantity_count: null,
          est_cost_usd: null,
          carrier_cost_usd: null,
          source_table: 'sample_preview',
          source_id: `sample-${seq}`,
          occurred_at: at.toISOString(),
          created_at: at.toISOString(),
        };
        events.push(event);
        made.push(event);
      }
    };
    addVoice('phone_voice', phoneCalls);
    addVoice('web_voice', webSessions);
    const rawTotal = made.reduce((n, e) => n + num(e.quantity_minutes), 0);
    const scale = rawTotal > 0 ? (allowance * targetShare) / rawTotal : 0;
    for (const e of made) {
      const minutes = Math.round(num(e.quantity_minutes) * scale * 10) / 10;
      e.quantity_minutes = minutes;
      e.est_cost_usd = Math.round(minutes * 0.0238 * 1_000_000) / 1_000_000;
      if (e.service === 'phone_voice') e.carrier_cost_usd = Math.round(minutes * 0.014 * 1_000_000) / 1_000_000;
    }
    return made;
  };

  // Current month: the rich month the preview is about (~69 events).
  const current = voiceMonth(0, 38, 16, 0.62);
  // Video avatar on a handful of web sessions (upper-bound proxy, as in the
  // real ledger backfill).
  for (const e of current.filter((x) => x.service === 'web_voice').slice(0, 6)) {
    push({
      service: 'video_avatar', provider: 'simli',
      quantity_minutes: e.quantity_minutes, occurred_at: e.occurred_at,
    });
  }
  const day = () => 1 + Math.floor(rand() * Math.max(1, now.getUTCDate()));
  const atDay = (d: number, hour: number) => {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d, hour, Math.floor(rand() * 60)));
    if (at.getTime() > now.getTime()) at.setTime(now.getTime() - Math.floor(rand() * 3600000));
    return at.toISOString();
  };
  for (let i = 0; i < 5; i++) {
    const segments = 1 + Math.floor(rand() * 3);
    push({
      service: 'sms', provider: 'twilio', line_number: '+18778624949',
      quantity_count: segments, est_cost_usd: Math.round(segments * 0.0079 * 1_000_000) / 1_000_000,
      carrier_cost_usd: Math.round(segments * 0.0079 * 1_000_000) / 1_000_000,
      occurred_at: atDay(day(), 9 + Math.floor(rand() * 10)),
    });
  }
  for (let i = 0; i < 4; i++) {
    push({
      service: 'email', provider: 'hostinger', quantity_count: 1,
      est_cost_usd: 0.001, occurred_at: atDay(day(), 9 + Math.floor(rand() * 10)),
    });
  }
  // Three prior months at lower volume so the rollover bank preview is
  // plausible instead of a full-allowance windfall (the 90-day bank window
  // reaches back three month-ends; an empty month would bank in full).
  voiceMonth(1, 12, 6, 0.55);
  voiceMonth(2, 10, 5, 0.45);
  voiceMonth(3, 8, 4, 0.5);

  return events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

// ---------------------------------------------------------------------------
// CSV export — every cell goes through csvCell (formula-neutralizing).
// ---------------------------------------------------------------------------

export const USAGE_CSV_HEADERS = [
  'occurred_at', 'organization', 'service', 'provider', 'line_number',
  'quantity_minutes', 'quantity_count', 'est_cost_usd', 'carrier_cost_usd',
  'source_table', 'source_id', 'id',
] as const;

export function usageEventsToCsv(events: UsageEvent[], orgNameById: Record<string, string>): string {
  const rows = (events || []).map((e) => [
    e.occurred_at,
    e.organization_id ? (orgNameById[e.organization_id] ?? e.organization_id) : 'Unattributed',
    SERVICE_LABELS[e.service] ?? e.service,
    PROVIDER_LABELS[e.provider] ?? e.provider,
    e.line_number ?? '',
    e.quantity_minutes ?? '',
    e.quantity_count ?? '',
    e.est_cost_usd ?? '',
    e.carrier_cost_usd ?? '',
    e.source_table,
    e.source_id,
    e.id,
  ].map(csvCell).join(','));
  return [USAGE_CSV_HEADERS.map(csvCell).join(','), ...rows].join('\r\n');
}
