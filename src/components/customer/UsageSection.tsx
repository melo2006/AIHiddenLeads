import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { StripeEmbeddedCheckout } from '@/components/StripeEmbeddedCheckout';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import {
  aggregateUsage, bucketize, computeMinuteBalance, monthKeyFor, packBalance, planForPriceId, sampleUsageEvents, thresholdPct,
  MINUTE_PACKS, SERVICES, SERVICE_COLORS, SERVICE_LABELS, type MinutePack, type UsageEvent, type UsageReportSettings,
} from '@/lib/usageReporting';

const usageChartConfig: ChartConfig = Object.fromEntries(
  SERVICES.map((s) => [s, { label: SERVICE_LABELS[s], color: SERVICE_COLORS[s] }]),
);

const SampleBadge = () => (
  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">Sample data</span>
);

const PAGE_SIZE = 1000;
const MAX_PAGES = 20; // 20k rows is far beyond a single client's 13 months.

function windowStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1));
}

async function fetchOrgEvents(organizationId: string): Promise<UsageEvent[]> {
  const rows: UsageEvent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('usage_events')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('occurred_at', windowStart().toISOString())
      .order('occurred_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as UsageEvent[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

const mins = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * "Usage & minutes" section for /account (paid customers only — the parent
 * renders it inside the paid branch). All queries are the customer's own
 * rows: customer_workspaces / subscriptions / usage_events /
 * minute_pack_purchases are all readable under their RLS policies.
 */
export default function UsageSection({ userId }: { userId: string; agentId?: string }) {
  const [selectedPack, setSelectedPack] = useState<MinutePack | null>(null);
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const [cadence, setCadence] = useState('weekly');
  const [reportEmail, setReportEmail] = useState('');
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [alertPhone, setAlertPhone] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [preview, setPreview] = useState(false);

  const accountQuery = useQuery({
    queryKey: ['customer-usage-account', userId],
    queryFn: async () => {
      const [{ data: workspaces, error: wErr }, { data: subs, error: sErr }, { data: auth }] = await Promise.all([
        supabase.from('customer_workspaces').select('organization_id, agent_id').eq('user_id', userId).limit(1),
        supabase.from('subscriptions').select('price_id, status, current_period_start, current_period_end').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.auth.getUser(),
      ]);
      if (wErr) throw new Error(wErr.message);
      if (sErr) throw new Error(sErr.message);
      const subscription = (subs || []).find((s) => s.status === 'active' || s.status === 'trialing') || (subs || [])[0] || null;
      return {
        organizationId: workspaces?.[0]?.organization_id || null,
        subscription,
        email: auth.user?.email || '',
      };
    },
  });

  const organizationId = accountQuery.data?.organizationId || null;
  const subscription = accountQuery.data?.subscription || null;

  const eventsQuery = useQuery({
    queryKey: ['customer-usage-events', organizationId],
    queryFn: () => fetchOrgEvents(organizationId!),
    enabled: Boolean(organizationId),
  });
  const purchasesQuery = useQuery({
    queryKey: ['customer-usage-purchases', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('minute_pack_purchases').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });
  const settingsQuery = useQuery({
    queryKey: ['customer-usage-settings', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('usage_report_settings').select('*').eq('organization_id', organizationId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data as UsageReportSettings | null;
    },
    enabled: Boolean(organizationId),
  });

  useEffect(() => {
    if (settingsHydrated || settingsQuery.data === undefined) return;
    const row = settingsQuery.data;
    setCadence(row?.cadence || 'weekly');
    setReportEmail(row?.report_email || accountQuery.data?.email || '');
    setSmsAlerts(Boolean(row?.sms_alerts));
    setAlertPhone(row?.alert_phone || '');
    setSettingsHydrated(true);
  }, [settingsQuery.data, settingsHydrated, accountQuery.data?.email]);

  const now = new Date();
  const realEvents = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const plan = planForPriceId(subscription?.price_id);
  const allowance = plan?.minutes ?? 0;
  const subscriptionActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  // Sample-data preview: generated client-side only, never fetched from or
  // written to Supabase. In preview mode it REPLACES the display dataset —
  // it is never merged with real query results.
  const sampleEvents = useMemo(
    () => (preview ? sampleUsageEvents({ organizationId, allowanceMinutes: allowance }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, organizationId, allowance],
  );
  const events = preview ? sampleEvents : realEvents;
  const nearlyEmpty = !eventsQuery.isLoading && !eventsQuery.error && realEvents.length <= 2;
  const balance = useMemo(
    () => computeMinuteBalance({ allowanceMinutes: allowance, events, now, subscriptionActive }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowance, events, subscriptionActive],
  );
  const packMinutes = useMemo(() => packBalance(purchasesQuery.data || [], now), [purchasesQuery.data]);
  const thisMonthKey = monthKeyFor(now);
  const callsAnswered = useMemo(
    () => aggregateUsage(events.filter((e) => monthKeyFor(e.occurred_at) === thisMonthKey)).byService.phone_voice?.events ?? 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events],
  );
  const recent = useMemo(
    () => [...events].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).slice(0, 10),
    [events],
  );
  const chartData = useMemo(
    () => bucketize(events.filter((e) => monthKeyFor(e.occurred_at) === thisMonthKey), 'day'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events],
  );
  const usedPct = Math.min(100, thresholdPct(balance.usedThisMonth, allowance));

  async function saveSettings() {
    if (!organizationId) return;
    setSaving(true);
    setSettingsMsg('');
    setSettingsError('');
    const { error } = await supabase.from('usage_report_settings').upsert({
      organization_id: organizationId,
      cadence,
      report_email: reportEmail.trim() || null,
      sms_alerts: smsAlerts,
      alert_phone: smsAlerts ? (alertPhone.trim() || null) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });
    setSaving(false);
    if (error) {
      // Surfaced honestly: if the member INSERT/UPDATE RLS policy is not in
      // place yet, the customer sees the real reason instead of a fake save.
      setSettingsError(`Could not save report settings: ${error.message}`);
      return;
    }
    setSettingsMsg('Report settings saved.');
    void settingsQuery.refetch();
  }

  return (
    <section className="space-y-4 border-t border-border pt-5">
      <h2 className="text-lg font-semibold">Usage &amp; minutes</h2>

      {preview && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3" role="status">
          <p className="text-sm"><strong>SAMPLE DATA — preview only.</strong> These numbers are examples so you can see how your dashboard will look. They are not your usage and are never saved.</p>
          <Button variant="outline" size="sm" onClick={() => setPreview(false)}>Exit preview</Button>
        </div>
      )}

      {accountQuery.isLoading && <p className="text-sm text-muted-foreground">Loading your usage…</p>}
      {accountQuery.error && <p role="alert" className="text-sm text-destructive">Could not load your usage: {accountQuery.error instanceof Error ? accountQuery.error.message : 'unknown error'}</p>}
      {accountQuery.data && !organizationId && (
        <p className="text-sm text-muted-foreground">Your workspace is still being set up — your usage will appear here once it is ready.</p>
      )}

      {organizationId && <>
        {nearlyEmpty && !preview && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-sm font-semibold">No usage yet</p>
            <p className="text-sm text-muted-foreground">Aspen hasn't handled any calls, website sessions, texts or emails for you yet — when she does, they'll show up here. Want to see what your dashboard will look like?</p>
            <Button variant="outline" onClick={() => setPreview(true)}>Preview with sample data</Button>
          </div>
        )}
        <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{plan ? `${plan.name} plan` : 'Your plan'}</span>
            {preview && <SampleBadge />}
            {plan && <span className="text-muted-foreground"> · {allowance} voice minutes/month included</span>}
          </p>
          <div>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>Used this month: <strong>{mins(balance.usedThisMonth)}</strong> of {allowance} minutes</span>
              <span className="text-muted-foreground">{allowance ? `${thresholdPct(balance.usedThisMonth, allowance).toFixed(0)}%` : ''}</span>
            </div>
            <Progress value={usedPct} className="mt-2" aria-label="Voice minutes used this month" />
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Banked rollover minutes</p><p className="font-semibold">{mins(balance.bankedMinutes)}</p><p className="text-xs text-muted-foreground">Unused minutes bank for 90 days while you stay subscribed.</p></div>
            <div><p className="text-xs text-muted-foreground">Pack minutes available</p><p className="font-semibold">{packMinutes}</p><p className="text-xs text-muted-foreground">From minute packs bought in the last 90 days.</p></div>
            <div><p className="text-xs text-muted-foreground">Calls answered by Aspen</p><p className="font-semibold">{callsAnswered}</p><p className="text-xs text-muted-foreground">Phone calls this month.</p></div>
          </div>
          <p className="text-sm">Minutes remaining this month: <strong>{mins(Math.max(0, balance.remainingThisMonth + packMinutes))}</strong> <span className="text-muted-foreground">(plan + banked + packs − used)</span></p>
        </div>

        {chartData.length > 0 && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">Minutes this month, by day {preview && <SampleBadge />}</p>
            <ChartContainer config={usageChartConfig} className="max-h-[220px] w-full">
              <AreaChart data={chartData} margin={{ left: 4, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={48} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {SERVICES.map((s) => (
                  <Area key={s} dataKey={s} type="monotone" stackId="1" fill={`var(--color-${s})`} stroke={`var(--color-${s})`} fillOpacity={0.55} />
                ))}
              </AreaChart>
            </ChartContainer>
          </div>
        )}

        <div className="rounded-lg border border-border p-3 space-y-2">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">Recent activity {preview && <SampleBadge />}</h3>
          {eventsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading activity…</p>}
          {eventsQuery.error && <p role="alert" className="text-xs text-destructive">Could not load activity: {eventsQuery.error instanceof Error ? eventsQuery.error.message : 'unknown error'}</p>}
          {!eventsQuery.isLoading && !recent.length && <p className="text-xs text-muted-foreground">No usage recorded yet. Calls, website voice sessions, texts and emails Aspen handles will show up here.</p>}
          <ul className="divide-y divide-border">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                <span>{SERVICE_LABELS[e.service] ?? e.service}</span>
                <span className="text-muted-foreground">
                  {e.quantity_minutes != null ? `${mins(Number(e.quantity_minutes))} min` : e.quantity_count != null ? `${e.quantity_count}` : ''}
                  {' · '}{new Date(e.occurred_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <h3 className="text-sm font-semibold">Usage reports</h3>
          <p className="text-xs text-muted-foreground">Get a summary of what Aspen handled, and an alert before you run out of minutes.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Report schedule
              <Select value={cadence} onValueChange={setCadence}>
                <SelectTrigger aria-label="Report schedule"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">Report email
              <Input type="email" aria-label="Report email" value={reportEmail} onChange={(e) => setReportEmail(e.target.value)} placeholder="you@yourbusiness.com" />
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={smsAlerts} onCheckedChange={setSmsAlerts} aria-label="Text me usage alerts" />
            Text me when I reach 80% and 100% of my minutes
          </label>
          {smsAlerts && (
            <label className="block max-w-sm space-y-1 text-sm">Mobile number for alerts
              <Input type="tel" aria-label="Mobile number for alerts" value={alertPhone} onChange={(e) => setAlertPhone(e.target.value)} placeholder="+1 555 555 5555" />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void saveSettings()} disabled={saving}>{saving ? 'Saving…' : 'Save report settings'}</Button>
            {settingsMsg && <p role="status" className="text-sm text-primary">{settingsMsg}</p>}
          </div>
          {settingsError && <p role="alert" className="text-sm text-destructive">{settingsError}</p>}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Need more minutes?</h3>
          <PaymentTestModeBanner />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MINUTE_PACKS.map((pack) => (
              <div key={pack.id} className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-semibold">{pack.minutes} voice minutes</p>
                <p className="text-xl font-bold">${(pack.priceCents / 100).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">${(pack.priceCents / 100 / pack.minutes).toFixed(2)}/min · one-time · expires 90 days after purchase</p>
                <Button variant="outline" className="w-full" onClick={() => { setSelectedPack(pack); setCheckoutFailed(false); }}>
                  Buy {pack.minutes} minutes
                </Button>
              </div>
            ))}
          </div>
          {selectedPack && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{selectedPack.minutes} voice minutes · ${(selectedPack.priceCents / 100).toFixed(2)} one-time</p>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPack(null)}>Cancel</Button>
              </div>
              {checkoutFailed
                ? <p role="alert" className="text-sm text-destructive">Checkout is unavailable for this pack right now. No payment has been taken — please try again later.</p>
                : <StripeEmbeddedCheckout
                    key={`${selectedPack.id}-${organizationId}`}
                    priceId={selectedPack.id}
                    organizationId={organizationId}
                    returnUrl={`${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`}
                    onUnavailable={() => setCheckoutFailed(true)}
                  />}
              <p className="text-xs text-muted-foreground">Pack minutes are added to your balance once payment is confirmed, and expire 90 days after purchase.</p>
            </div>
          )}
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1 opacity-80">
            <p className="text-sm font-semibold text-muted-foreground">Video minute packs — coming soon</p>
            <p className="text-xs text-muted-foreground">Pricing is being finalized for video avatar minutes. Voice packs above work today.</p>
          </div>
        </div>
      </>}
    </section>
  );
}
