import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { trySend } from '../_shared/hostinger-mail.ts';
import { trySendFollowupSms } from '../_shared/twilio-sms.ts';
import { paidAccess } from '../_shared/payment-rules.ts';
import { logEmailSend } from '../_shared/usage-ledger.ts';
import {
  PLAN_ALLOWANCES,
  aggregateUsage,
  alertText,
  computeMinuteBalance,
  lastCompletedPeriodKey,
  monthKeyFor,
  periodLabel,
  renderUsageReportHtml,
  renderUsageReportText,
  reportPeriodRange,
  thresholdCrossings,
  type PlanPriceId,
  type ReportCadence,
} from '../_shared/usage-reporting.ts';

// Usage reports + threshold alerts (Usage Reporting Suite, 2026-11-12).
//
// Copied in shape from followup-sweep: a plain HTTP function, an optional
// secret header, and claim-before-send bookkeeping — each send first
// stamps its bookkeeping column (guarded on the old value, the followup
// pattern), and a failed send releases the claim so the next run retries.
//
// Scheduling is a DEPLOY STEP, not part of this function: the pg_cron +
// pg_net SQL lives commented-out at the bottom of
// drizzle/migrations/0020_usage_reporting.sql and must be run separately
// in the dashboard. Until then this function is invocable manually.
//
// NO sends happen until usage_report_settings rows with emails/phones
// exist: reports and alerts are driven entirely by those rows. Alerts in
// particular REQUIRE a settings row carrying a report_email or an
// alert_phone — organizations without a settings row get no alerts.
// Reports additionally require cadence <> 'off'; alerts run for every
// settings row regardless of cadence. Both need a resolvable paid
// subscription, because the plan allowance is what usage is measured
// against.

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const DASHBOARD_URL = 'https://aihiddenleads.com/account';

type SettingsRow = {
  id: string;
  organization_id: string;
  cadence: string;
  report_email: string | null;
  sms_alerts: boolean;
  alert_phone: string | null;
  threshold_80_period: string | null;
  threshold_100_period: string | null;
  last_report_period: string | null;
  last_report_sent_at: string | null;
};

/** Claim a stamp column: set it only if it still holds its old value. */
async function claimStamp(db: any, row: SettingsRow, column: string, value: string, extra: Record<string, unknown> = {}): Promise<boolean> {
  const old = (row as Record<string, unknown>)[column] as string | null;
  let q = db.from('usage_report_settings').update({ [column]: value, ...extra }).eq('id', row.id);
  q = old == null ? q.is(column, null) : q.eq(column, old);
  const { data, error } = await q.select('id');
  if (error) { console.error(`usage-reports: claim ${column} failed`, error.message); return false; }
  return Array.isArray(data) && data.length > 0;
}

async function releaseStamp(db: any, row: SettingsRow, column: string, claimedValue: string, extra: Record<string, unknown> = {}): Promise<void> {
  const old = (row as Record<string, unknown>)[column] as string | null;
  await db.from('usage_report_settings').update({ [column]: old, ...extra }).eq('id', row.id).eq(column, claimedValue);
}

/** Resolve an organization's plan allowance: customer_workspaces ->
 *  user_id -> subscriptions (latest paidAccess row). Same resolution
 *  shape as customer-billing / customer-payments, copied not imported
 *  (functions do not import across function folders). */
async function resolveOrgPlan(db: any, organizationId: string) {
  const { data: workspaces, error } = await db.from('customer_workspaces')
    .select('user_id, environment').eq('organization_id', organizationId);
  if (error) { console.error('usage-reports: workspace lookup failed', error.message); return null; }
  for (const ws of (workspaces || []) as { user_id: string; environment: string }[]) {
    const { data: subs } = await db.from('subscriptions')
      .select('*').eq('user_id', ws.user_id).eq('environment', ws.environment)
      .order('created_at', { ascending: false });
    const sub = (subs || []).find((s: any) => paidAccess(s.status, s.current_period_end));
    if (sub && sub.price_id in PLAN_ALLOWANCES) {
      const plan = PLAN_ALLOWANCES[sub.price_id as PlanPriceId];
      return { userId: ws.user_id, priceId: sub.price_id as PlanPriceId, allowanceMinutes: plan.minutes, planName: plan.name };
    }
  }
  return null;
}

/** Voice minutes per calendar month (current month + the 3 before it). */
async function voiceMinutesByMonth(db: any, organizationId: string, now: Date): Promise<Record<string, number>> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const { data, error } = await db.from('usage_events')
    .select('service, quantity_minutes, occurred_at')
    .eq('organization_id', organizationId)
    .in('service', ['web_voice', 'phone_voice'])
    .gte('occurred_at', start.toISOString())
    .limit(10000);
  if (error) { console.error('usage-reports: monthly usage query failed', error.message); return {}; }
  const out: Record<string, number> = {};
  for (const e of (data || []) as { quantity_minutes: number | string | null; occurred_at: string }[]) {
    const key = monthKeyFor(e.occurred_at);
    const minutes = typeof e.quantity_minutes === 'string' ? Number(e.quantity_minutes) : e.quantity_minutes;
    out[key] = (out[key] || 0) + (typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : 0);
  }
  return out;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('USAGE_REPORTS_SECRET');
  if (secret && req.headers.get('x-usage-reports-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const now = new Date();

  const { data: settings, error } = await db.from('usage_report_settings').select('*').limit(500);
  if (error) {
    // Pre-migration (table missing): nothing can be claimed, so nothing
    // may be sent — report and exit cleanly, like followup-sweep.
    console.error('usage-reports: settings query failed', error.message);
    return json({ ok: false, reason: 'usage_settings_unavailable', processed: 0, reportsSent: 0, alertsSent: 0 });
  }

  let processed = 0;
  let reportsSent = 0;
  let alertsSent = 0;

  for (const row of (settings || []) as SettingsRow[]) {
    processed++;
    try {
      const plan = await resolveOrgPlan(db, row.organization_id);
      if (!plan) continue; // no paid plan -> no allowance to measure against

      const { data: org } = await db.from('voice_organizations').select('name').eq('id', row.organization_id).maybeSingle();
      const orgName = String(org?.name || 'your business');

      const byMonth = await voiceMinutesByMonth(db, row.organization_id, now);
      const balance = computeMinuteBalance({
        allowanceMinutes: plan.allowanceMinutes,
        eventsByMonth: byMonth,
        currentMonthKey: monthKeyFor(now),
        subscriptionActive: true,
        now,
      });

      // ---------------- Reports (cadence-driven) ----------------
      const cadence = row.cadence as ReportCadence | 'off';
      if (cadence !== 'off' && row.report_email) {
        const periodKey = lastCompletedPeriodKey(cadence, now);
        if (row.last_report_period !== periodKey) {
          const claimed = await claimStamp(db, row, 'last_report_period', periodKey, { last_report_sent_at: now.toISOString() });
          if (claimed) {
            let ok = false;
            try {
              const range = reportPeriodRange(periodKey, cadence);
              const { data: events, error: evErr } = await db.from('usage_events')
                .select('service, quantity_minutes, quantity_count, est_cost_usd, occurred_at')
                .eq('organization_id', row.organization_id)
                .gte('occurred_at', range.startIso)
                .lt('occurred_at', range.endIso)
                .limit(10000);
              if (evErr) throw new Error(evErr.message);
              const totals = aggregateUsage(events || [], range);
              const callsAnswered = totals.byService.phone_voice?.events ?? 0;
              const label = periodLabel(periodKey, cadence);
              const renderInput = { orgName, periodLabel: label, totals, balance, dashboardUrl: DASHBOARD_URL, callsAnswered };
              const subject = `Your Aspen usage report — ${label}`;
              ok = await trySend({ to: row.report_email, subject, text: renderUsageReportText(renderInput), html: renderUsageReportHtml(renderInput) });
              if (ok) {
                await logEmailSend(db, { to: row.report_email, subject }, {
                  organizationId: row.organization_id,
                  sourceTable: 'usage_reports',
                  sourceId: `${row.id}:${periodKey}`,
                });
              }
            } catch (e) {
              console.error(`usage-reports: report for org ${row.organization_id} failed`, e instanceof Error ? e.message : e);
              ok = false;
            }
            if (ok) reportsSent++;
            else await releaseStamp(db, row, 'last_report_period', periodKey, { last_report_sent_at: row.last_report_sent_at });
          }
        }
      }

      // ---------------- Threshold alerts (any cadence) ----------------
      const hasChannel = Boolean(row.report_email) || Boolean(row.sms_alerts && row.alert_phone);
      if (hasChannel) {
        const currentMonthKey = monthKeyFor(now);
        const crossed = thresholdCrossings(balance.currentUsed, plan.allowanceMinutes);
        for (const threshold of [80, 100] as const) {
          if (crossed < threshold) continue;
          const column = threshold === 80 ? 'threshold_80_period' : 'threshold_100_period';
          if ((row as Record<string, unknown>)[column] === currentMonthKey) continue;
          const claimed = await claimStamp(db, row, column, currentMonthKey);
          if (!claimed) continue;
          let ok = false;
          try {
            if (row.report_email) {
              const body = alertText(`usage_threshold_${threshold}`, threshold, orgName);
              const subject = threshold === 100
                ? `Aspen usage alert: ${orgName} has used all of this month's voice minutes`
                : `Aspen usage alert: ${orgName} has used ${threshold}% of this month's voice minutes`;
              const sent = await trySend({
                to: row.report_email,
                subject,
                text: `${body}\n\nSee the details and add minutes here: ${DASHBOARD_URL}`,
              });
              if (sent) {
                ok = true;
                await logEmailSend(db, { to: row.report_email, subject }, {
                  organizationId: row.organization_id,
                  sourceTable: 'usage_reports',
                  sourceId: `${row.id}:alert${threshold}:${currentMonthKey}`,
                });
              }
            }
            if (row.sms_alerts && row.alert_phone) {
              const sms = await trySendFollowupSms(db, {
                to: row.alert_phone,
                body: alertText(`usage_threshold_${threshold}`, threshold, orgName),
                templateId: `usage_threshold_${threshold}`,
              });
              if (sms.sent) ok = true;
            }
          } catch (e) {
            console.error(`usage-reports: alert ${threshold} for org ${row.organization_id} failed`, e instanceof Error ? e.message : e);
          }
          if (ok) alertsSent++;
          else await releaseStamp(db, row, column, currentMonthKey); // total failure: retry next run
        }
      }
    } catch (e) {
      console.error(`usage-reports: settings row ${row.id} failed`, e instanceof Error ? e.message : e);
    }
  }

  return json({ ok: true, processed, reportsSent, alertsSent });
});
