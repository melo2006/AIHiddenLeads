// Usage reporting math + rendering (Usage Reporting Suite, 2026-11-12).
//
// Server twin of the frontend usage math: pure functions, no I/O, so the
// reports engine (usage-reports function), the account UI and the tests
// all agree on periods, aggregation, the rollover bank and thresholds.
// No fabricated numbers anywhere: renderers print only what they are
// passed.

export const PLAN_ALLOWANCES = {
  essentials_monthly: { name: 'Premium', monthlyUsd: 99, minutes: 400 },
  growth_monthly: { name: 'Professional', monthlyUsd: 199, minutes: 1200 },
  fullservice_monthly: { name: 'Platinum', monthlyUsd: 349, minutes: 2500 },
} as const;

export type PlanPriceId = keyof typeof PLAN_ALLOWANCES;
export type ReportCadence = 'daily' | 'weekly' | 'monthly';

// ---------------------------------------------------------------------------
// Period helpers — all UTC. Daily key: YYYY-MM-DD. Weekly key: ISO week,
// Monday start, e.g. 2026-W46. Monthly key: YYYY-MM.
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 24 * 3600_000;

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function mondayOfUtcWeek(d: Date): Date {
  const day = startOfUtcDay(d);
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - dow * DAY_MS);
}
function isoWeekKey(d: Date): string {
  // ISO week-numbering year: the Thursday of this week decides the year.
  const monday = mondayOfUtcWeek(d);
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = mondayOfUtcWeek(jan4);
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * DAY_MS)) + 1;
  return `${year}-W${pad2(week)}`;
}
function mondayOfIsoWeekKey(key: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid weekly period key: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = mondayOfUtcWeek(jan4);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);
}

export function periodKeyFor(date: Date | string, cadence: ReportCadence): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (cadence === 'daily') return dateKey(d);
  if (cadence === 'monthly') return monthKey(d);
  return isoWeekKey(d);
}

/** [start, end) UTC range for a period key in the given cadence. */
export function reportPeriodRange(periodKey: string, cadence: ReportCadence): { start: Date; end: Date; startIso: string; endIso: string } {
  let start: Date;
  let end: Date;
  if (cadence === 'daily') {
    start = new Date(`${periodKey}T00:00:00.000Z`);
    end = new Date(start.getTime() + DAY_MS);
  } else if (cadence === 'monthly') {
    const [y, mo] = periodKey.split('-').map(Number);
    start = new Date(Date.UTC(y, mo - 1, 1));
    end = new Date(Date.UTC(y, mo, 1));
  } else {
    start = mondayOfIsoWeekKey(periodKey);
    end = new Date(start.getTime() + 7 * DAY_MS);
  }
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

/** The period containing `now`. */
export function currentPeriodKey(cadence: ReportCadence, now = new Date()): string {
  return periodKeyFor(now, cadence);
}

/** The last COMPLETED period before the one containing `now`
 *  (daily = yesterday, weekly = last ISO week, monthly = last month). */
export function lastCompletedPeriodKey(cadence: ReportCadence, now = new Date()): string {
  if (cadence === 'daily') return periodKeyFor(new Date(now.getTime() - DAY_MS), cadence);
  if (cadence === 'monthly') {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return periodKeyFor(prev, cadence);
  }
  return periodKeyFor(new Date(now.getTime() - 7 * DAY_MS), cadence);
}

export function monthKeyFor(date: Date | string): string {
  return monthKey(typeof date === 'string' ? new Date(date) : date);
}

/** Human label for a period key, e.g. "Week of Nov 9, 2026 (UTC)". */
export function periodLabel(periodKey: string, cadence: ReportCadence): string {
  const { start } = reportPeriodRange(periodKey, cadence);
  const nice = start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  if (cadence === 'daily') return nice;
  if (cadence === 'monthly') return start.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return `Week of ${nice}`;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface UsageEventLike {
  service: string;
  quantity_minutes?: number | string | null;
  quantity_count?: number | string | null;
  est_cost_usd?: number | string | null;
  occurred_at?: string | null;
}

export interface ServiceTotals {
  minutes: number;
  /** Sum of quantity_count (messages, AI calls, emails…). */
  count: number;
  estCostUsd: number;
  /** Number of ledger rows for this service. */
  events: number;
}

export interface UsageTotals {
  byService: Record<string, ServiceTotals>;
  /** web_voice + phone_voice minutes only — the minutes plans meter. */
  totalVoiceMinutes: number;
  totalEstCostUsd: number;
  eventCount: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

export function aggregateUsage(
  events: UsageEventLike[],
  range?: { start: Date | string; end: Date | string },
): UsageTotals {
  const startMs = range ? new Date(range.start as any).getTime() : null;
  const endMs = range ? new Date(range.end as any).getTime() : null;
  const byService: Record<string, ServiceTotals> = {};
  let totalVoiceMinutes = 0;
  let totalEstCostUsd = 0;
  let eventCount = 0;
  for (const e of events || []) {
    if (startMs != null || endMs != null) {
      const t = e.occurred_at ? Date.parse(e.occurred_at) : NaN;
      if (Number.isNaN(t)) continue;
      if (startMs != null && t < startMs) continue;
      if (endMs != null && t >= endMs) continue;
    }
    const svc = byService[e.service] ?? (byService[e.service] = { minutes: 0, count: 0, estCostUsd: 0, events: 0 });
    const minutes = num(e.quantity_minutes);
    svc.minutes += minutes;
    svc.count += num(e.quantity_count);
    svc.estCostUsd += num(e.est_cost_usd);
    svc.events += 1;
    if (e.service === 'web_voice' || e.service === 'phone_voice') totalVoiceMinutes += minutes;
    totalEstCostUsd += num(e.est_cost_usd);
    eventCount += 1;
  }
  for (const svc of Object.values(byService)) {
    svc.minutes = round3(svc.minutes);
    svc.estCostUsd = round6(svc.estCostUsd);
  }
  return { byService, totalVoiceMinutes: round3(totalVoiceMinutes), totalEstCostUsd: round6(totalEstCostUsd), eventCount };
}

// ---------------------------------------------------------------------------
// Minute balance + rollover bank
// ---------------------------------------------------------------------------

export interface MinuteBalance {
  allowanceMinutes: number;
  bankedMinutes: number;
  currentUsed: number;
  /** allowance + bank − current used (negative when over). */
  currentRemaining: number;
}

function normalizeMonthUsage(
  eventsByMonth: Record<string, number> | Array<{ monthKey: string; voiceMinutes: number }> | Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!eventsByMonth) return out;
  if (eventsByMonth instanceof Map) {
    for (const [k, v] of eventsByMonth) out.set(k, num(v));
  } else if (Array.isArray(eventsByMonth)) {
    for (const row of eventsByMonth) out.set(row.monthKey, num(row.voiceMinutes));
  } else {
    for (const [k, v] of Object.entries(eventsByMonth)) out.set(k, num(v));
  }
  return out;
}

function shiftMonthKey(key: string, deltaMonths: number): string {
  const [y, mo] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + deltaMonths, 1));
  return monthKey(d);
}
function monthEndExclusive(key: string): Date {
  const [y, mo] = key.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 1));
}

/**
 * Rollover bank: for each of the last 3 calendar months (excluding the
 * current one), the unused part of the allowance banks forward — but only
 * months whose month-end is within 90 days of `now` count, and only while
 * the subscription is active. An inactive subscription banks nothing.
 */
export function computeMinuteBalance(input: {
  allowanceMinutes: number;
  eventsByMonth: Record<string, number> | Array<{ monthKey: string; voiceMinutes: number }> | Map<string, number>;
  currentMonthKey: string;
  subscriptionActive: boolean;
  now?: Date;
}): MinuteBalance {
  const { allowanceMinutes, currentMonthKey, subscriptionActive } = input;
  const now = input.now ?? new Date();
  const byMonth = normalizeMonthUsage(input.eventsByMonth);
  const currentUsed = round3(byMonth.get(currentMonthKey) ?? 0);
  let banked = 0;
  if (subscriptionActive && allowanceMinutes > 0) {
    for (let back = 1; back <= 3; back++) {
      const key = shiftMonthKey(currentMonthKey, -back);
      const end = monthEndExclusive(key); // first instant of the next month
      const ageMs = now.getTime() - end.getTime();
      if (ageMs < 0 || ageMs > 90 * DAY_MS) continue; // not ended yet, or expired
      const used = byMonth.get(key) ?? 0;
      banked += Math.max(0, allowanceMinutes - used);
    }
  }
  const bankedMinutes = round3(banked);
  return {
    allowanceMinutes,
    bankedMinutes,
    currentUsed,
    currentRemaining: round3(allowanceMinutes + bankedMinutes - currentUsed),
  };
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Highest usage threshold crossed: 0, 80 or 100 (percent of allowance). */
export function thresholdCrossings(usedMinutes: number, allowanceMinutes: number): 0 | 80 | 100 {
  if (!allowanceMinutes || allowanceMinutes <= 0 || !Number.isFinite(usedMinutes)) return 0;
  const ratio = usedMinutes / allowanceMinutes;
  if (ratio >= 1) return 100;
  if (ratio >= 0.8) return 80;
  return 0;
}

// ---------------------------------------------------------------------------
// Rendering — self-contained inline-CSS HTML + plain-text twin.
// ---------------------------------------------------------------------------

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmtMin = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

const SERVICE_LABELS: Record<string, string> = {
  web_voice: 'Web voice (Aspen on your website)',
  phone_voice: 'Phone voice (Aspen answering calls)',
  video_avatar: 'Video avatar',
  chat_brain: 'Chat / website brain',
  sms: 'Text messages',
  email: 'Emails',
};

export interface UsageReportRenderInput {
  orgName: string;
  periodLabel: string;
  totals: UsageTotals;
  balance: MinuteBalance;
  dashboardUrl: string;
  /** phone_voice events in the period — calls Aspen answered. */
  callsAnswered?: number;
}

function reportFigures(input: UsageReportRenderInput) {
  const used = input.totals.totalVoiceMinutes;
  const allowance = input.balance.allowanceMinutes;
  const pct = allowance > 0 ? Math.round((used / allowance) * 1000) / 10 : 0;
  const rows = Object.entries(input.totals.byService)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([service, t]) => ({
      service,
      label: SERVICE_LABELS[service] || service,
      minutes: t.minutes,
      count: t.count,
      estCostUsd: t.estCostUsd,
    }));
  return { used, allowance, pct, rows };
}

export function renderUsageReportHtml(input: UsageReportRenderInput): string {
  const { used, allowance, pct, rows } = reportFigures(input);
  const calls = input.callsAnswered ?? input.totals.byService.phone_voice?.events ?? 0;
  const bodyRows = rows.map(r => `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:#0f172a">${esc(r.label)}</td><td style="padding:6px 12px;font-size:14px;color:#0f172a;text-align:right">${r.minutes ? `${esc(fmtMin(r.minutes))} min` : '—'}</td><td style="padding:6px 12px;font-size:14px;color:#0f172a;text-align:right">${r.count ? esc(String(r.count)) : '—'}</td><td style="padding:6px 0;font-size:14px;color:#0f172a;text-align:right">${esc(fmtUsd(r.estCostUsd))}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:20px 24px">
<div style="font-size:20px;font-weight:800;color:#0f172a">Your Aspen usage — ${esc(input.periodLabel)}</div>
<p style="font-size:15px;line-height:1.6;color:#0f172a">Hi ${esc(input.orgName || 'there')}, here is what Aspen handled for you in this period.</p>
<p style="font-size:15px;line-height:1.6;color:#0f172a"><strong>Voice minutes used: ${esc(fmtMin(used))} of ${esc(fmtMin(allowance))} (${esc(String(pct))}%)</strong></p>
<p style="font-size:15px;line-height:1.6;color:#0f172a">Calls answered by Aspen: <strong>${esc(String(calls))}</strong></p>
<p style="font-size:15px;line-height:1.6;color:#0f172a">Banked rollover minutes available: <strong>${esc(fmtMin(input.balance.bankedMinutes))}</strong> · Minutes remaining (allowance + bank − used): <strong>${esc(fmtMin(input.balance.currentRemaining))}</strong></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0">
<tr><td style="padding:6px 12px 6px 0;font-size:12px;color:#475569;text-transform:uppercase">Service</td><td style="padding:6px 12px;font-size:12px;color:#475569;text-align:right;text-transform:uppercase">Minutes</td><td style="padding:6px 12px;font-size:12px;color:#475569;text-align:right;text-transform:uppercase">Count</td><td style="padding:6px 0;font-size:12px;color:#475569;text-align:right;text-transform:uppercase">Est. cost</td></tr>
${bodyRows}
</table>
<p style="font-size:15px;line-height:1.6;color:#0f172a">Estimated total cost this period: <strong>${esc(fmtUsd(input.totals.totalEstCostUsd))}</strong> (estimate from measured audio, not a provider invoice).</p>
<p style="margin:18px 0"><a href="${esc(input.dashboardUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#10B981;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none">View your usage dashboard</a></p>
<p style="font-size:12px;color:#475569">AI Hidden Leads · Usage report for ${esc(input.orgName || 'your business')}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function renderUsageReportText(input: UsageReportRenderInput): string {
  const { used, allowance, pct, rows } = reportFigures(input);
  const calls = input.callsAnswered ?? input.totals.byService.phone_voice?.events ?? 0;
  const lines = [
    `Your Aspen usage — ${input.periodLabel}`,
    ``,
    `Hi ${input.orgName || 'there'}, here is what Aspen handled for you in this period.`,
    ``,
    `Voice minutes used: ${fmtMin(used)} of ${fmtMin(allowance)} (${pct}%)`,
    `Calls answered by Aspen: ${calls}`,
    `Banked rollover minutes available: ${fmtMin(input.balance.bankedMinutes)}`,
    `Minutes remaining (allowance + bank - used): ${fmtMin(input.balance.currentRemaining)}`,
    ``,
    `Breakdown:`,
    ...rows.map(r => `- ${r.label}: ${r.minutes ? `${fmtMin(r.minutes)} min` : 'no minutes'}${r.count ? `, count ${r.count}` : ''}, est. cost ${fmtUsd(r.estCostUsd)}`),
    ``,
    `Estimated total cost this period: ${fmtUsd(input.totals.totalEstCostUsd)} (estimate from measured audio, not a provider invoice).`,
    ``,
    `View your usage dashboard: ${input.dashboardUrl}`,
  ];
  return lines.join('\n');
}

/** Short threshold-alert SMS body (<= 320 chars). */
export function alertText(kind: string, pct: number, orgName: string): string {
  const name = (orgName || 'your business').slice(0, 80);
  const body = pct >= 100 || String(kind).includes('100')
    ? `AI Hidden Leads: ${name} has used 100% of this month's Aspen voice minutes. Extra minutes are available as add-on packs in your account.`
    : `AI Hidden Leads: ${name} has used ${pct}% of this month's Aspen voice minutes. We'll let you know before you run out.`;
  return body.slice(0, 320);
}
