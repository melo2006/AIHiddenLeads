import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import {
  aggregateUsage, bucketize, computeMinuteBalance, filterUsageEvents, packBalance, planForPriceId,
  presetRange, thresholdState, usageEventsToCsv, PROVIDER_LABELS, PROVIDERS, SERVICES, SERVICE_COLORS,
  SERVICE_LABELS, type RangePreset, type UsageEvent,
} from '@/lib/usageReporting';

const money = (v: number) => `$${v.toFixed(2)}`;
const mins = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// Fetch window: the last 13 calendar months covers every preset and the
// 90-day rollover bank with room to spare. PostgREST caps each response, so
// page through .range() in 1,000-row pages; hard cap 50 pages (50k rows) —
// if the ledger ever outgrows that, this view needs a server-side rollup.
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

function windowStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 13, 1));
}

async function fetchUsageWindow(): Promise<UsageEvent[]> {
  const fromIso = windowStart().toISOString();
  const rows: UsageEvent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('usage_events')
      .select('*')
      .gte('occurred_at', fromIso)
      .order('occurred_at', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as UsageEvent[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

type OrgRow = { id: string; name: string };
type PlanInfo = { priceId: string; status: string };

const chartConfig: ChartConfig = Object.fromEntries(
  SERVICES.map((s) => [s, { label: SERVICE_LABELS[s], color: SERVICE_COLORS[s] }]),
);

export default function UsageReportsView() {
  const [client, setClient] = useState('all');
  const [service, setService] = useState('all');
  const [provider, setProvider] = useState('all');
  const [line, setLine] = useState('all');
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const eventsQuery = useQuery({ queryKey: ['usage-reports-events'], queryFn: fetchUsageWindow });
  const orgsQuery = useQuery({
    queryKey: ['usage-reports-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('voice_organizations').select('id, name').order('name');
      if (error) throw new Error(error.message);
      return (data || []) as OrgRow[];
    },
  });
  const telephonyQuery = useQuery({
    queryKey: ['usage-reports-telephony-clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('telephony_clients').select('id, client_name, organization_id, voice_number');
      if (error) throw new Error(error.message);
      return data || [];
    },
  });
  const plansQuery = useQuery({
    queryKey: ['usage-reports-plans'],
    queryFn: async () => {
      const [{ data: workspaces, error: wErr }, { data: subs, error: sErr }] = await Promise.all([
        supabase.from('customer_workspaces').select('user_id, organization_id'),
        supabase.from('subscriptions').select('user_id, price_id, status, current_period_end'),
      ]);
      if (wErr) throw new Error(wErr.message);
      if (sErr) throw new Error(sErr.message);
      const subByUser = new Map<string, PlanInfo>();
      for (const s of subs || []) {
        const existing = subByUser.get(s.user_id);
        // Prefer a live subscription when a user has several rows.
        if (!existing || (s.status === 'active' || s.status === 'trialing')) {
          subByUser.set(s.user_id, { priceId: s.price_id, status: s.status });
        }
      }
      const orgPlan = new Map<string, PlanInfo>();
      for (const w of workspaces || []) {
        const plan = subByUser.get(w.user_id);
        if (plan) orgPlan.set(w.organization_id, plan);
      }
      return orgPlan;
    },
  });
  const purchasesQuery = useQuery({
    queryKey: ['usage-reports-pack-purchases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('minute_pack_purchases').select('organization_id, minutes, status, created_at');
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const orgs = orgsQuery.data || [];
  const orgNameById = useMemo(() => Object.fromEntries(orgs.map((o) => [o.id, o.name])), [orgs]);
  const lineLabelByNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of telephonyQuery.data || []) {
      if (c.voice_number) map.set(c.voice_number, c.client_name);
    }
    return map;
  }, [telephonyQuery.data]);
  const lineNumbers = useMemo(
    () => [...new Set(events.map((e) => e.line_number).filter((v): v is string => Boolean(v)))].sort(),
    [events],
  );

  const now = new Date();
  const rawRange = presetRange(preset, now, { from: customFrom || undefined, to: customTo || undefined });
  const winStart = windowStart(now);
  const clamped = rawRange.from < winStart;
  const range = { from: clamped ? winStart : rawRange.from, to: rawRange.to };
  const rangeDays = Math.max(1, (range.to.getTime() - range.from.getTime()) / 86400000);
  const bucketBy = rangeDays > 62 ? 'week' : 'day';

  const baseFilters = {
    service: service === 'all' ? undefined : service,
    provider: provider === 'all' ? undefined : provider,
    lineNumber: line === 'all' ? undefined : line,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };
  const filtered = useMemo(
    () => filterUsageEvents(events, { ...baseFilters, organizationId: client === 'all' ? undefined : client === 'unattributed' ? null : client }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, client, service, provider, line, range.from.getTime(), range.to.getTime()],
  );
  const rangeFilteredAllClients = useMemo(
    () => filterUsageEvents(events, baseFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, service, provider, line, range.from.getTime(), range.to.getTime()],
  );

  const agg = useMemo(() => aggregateUsage(filtered), [filtered]);
  const chartData = useMemo(() => bucketize(filtered, bucketBy), [filtered, bucketBy]);

  const clientRows = useMemo(() => orgs.map((org) => {
    const planInfo = plansQuery.data?.get(org.id) || null;
    const plan = planForPriceId(planInfo?.priceId);
    const allowance = plan?.minutes ?? 0;
    const orgEvents = events.filter((e) => e.organization_id === org.id);
    const balance = computeMinuteBalance({
      allowanceMinutes: allowance,
      events: orgEvents,
      now,
      subscriptionActive: Boolean(planInfo && (planInfo.status === 'active' || planInfo.status === 'trialing')),
    });
    const orgPurchases = (purchasesQuery.data || []).filter((p) => p.organization_id === org.id);
    const periodCost = aggregateUsage(rangeFilteredAllClients.filter((e) => e.organization_id === org.id)).totals.estCostUsd;
    const state = plan ? thresholdState(balance.usedThisMonth, allowance) : null;
    return { org, planInfo, plan, allowance, balance, packMinutes: packBalance(orgPurchases, now), periodCost, state };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [orgs, plansQuery.data, purchasesQuery.data, events, rangeFilteredAllClients]);

  function download() {
    const csv = usageEventsToCsv(filtered, orgNameById);
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'usage-events.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const loading = eventsQuery.isLoading || orgsQuery.isLoading;
  const loadError = eventsQuery.error || orgsQuery.error || plansQuery.error || purchasesQuery.error;

  return (
    <section className="space-y-5 text-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Usage Reports</h1>
          <p className="text-xs text-muted-foreground">Unified usage ledger · last 13 months · all times UTC</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => { void eventsQuery.refetch(); void plansQuery.refetch(); void purchasesQuery.refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={download} disabled={!filtered.length}>
            <Download className="mr-2 h-4 w-4" />Export CSV
          </Button>
        </div>
      </header>

      {loadError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">Could not load usage data: {loadError instanceof Error ? loadError.message : 'unknown error'}</p>}

      <div className="flex flex-wrap gap-2">
        <Select value={client} onValueChange={setClient}>
          <SelectTrigger className="w-52" aria-label="Client"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            <SelectItem value="unattributed">Unattributed</SelectItem>
            {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger className="w-52" aria-label="Service"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {SERVICES.map((s) => <SelectItem key={s} value={s}>{SERVICE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-40" aria-label="Provider"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={line} onValueChange={setLine}>
          <SelectTrigger className="w-56" aria-label="Line number"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lines</SelectItem>
            {lineNumbers.map((n) => <SelectItem key={n} value={n}>{lineLabelByNumber.get(n) ? `${n} · ${lineLabelByNumber.get(n)}` : n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
          <SelectTrigger className="w-40" aria-label="Date range"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="custom">Custom dates</SelectItem>
          </SelectContent>
        </Select>
        {preset === 'custom' && <>
          <Input type="date" aria-label="From" className="w-40" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <Input type="date" aria-label="To" className="w-40" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </>}
      </div>
      {preset === 'custom' && clamped && (
        <p className="text-xs text-muted-foreground">Custom range starts before the loaded 13-month window — showing from {winStart.toISOString().slice(0, 10)}.</p>
      )}

      <div className="grid grid-cols-2 gap-4 border-y border-border py-4 lg:grid-cols-5">
        <div><p className="text-xs text-muted-foreground">Voice minutes (web + phone)</p><p className="text-xl font-bold">{mins(agg.totals.voiceMinutes)}</p></div>
        <div><p className="text-xs text-muted-foreground">Est. AI cost</p><p className="text-xl font-bold">{money(agg.totals.estCostUsd)}</p></div>
        <div><p className="text-xs text-muted-foreground">Carrier cost</p><p className="text-xl font-bold">{money(agg.totals.carrierCostUsd)}</p></div>
        <div><p className="text-xs text-muted-foreground">Events</p><p className="text-xl font-bold">{agg.totals.events}</p></div>
        <div><p className="text-xs text-muted-foreground">SMS count</p><p className="text-xl font-bold">{agg.byService.sms?.count ?? 0}</p></div>
      </div>

      {chartData.length > 0 ? (
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-xs font-medium">Minutes by {bucketBy === 'week' ? 'week (ISO Monday, UTC)' : 'day (UTC)'}, stacked by service</p>
          <ChartContainer config={chartConfig} className="max-h-[320px] w-full">
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
      ) : (
        <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">{loading ? 'Loading usage…' : 'No usage events match these filters.'}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="p-2">Client</th><th className="p-2">Plan</th><th className="p-2">Allowance</th>
              <th className="p-2">Used (this month, voice)</th><th className="p-2">Banked</th><th className="p-2">Pack min</th>
              <th className="p-2">Est. cost (selected period)</th><th className="p-2">Plan $/mo</th>
              <th className="p-2">Margin (this month)</th><th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {clientRows.map(({ org, plan, allowance, balance, packMinutes, periodCost, state }) => (
              <tr key={org.id} className="border-b border-border">
                <td className="p-2 font-medium">{org.name}</td>
                <td className="p-2">{plan ? plan.name : '—'}</td>
                <td className="p-2">{plan ? `${allowance} min` : '—'}</td>
                <td className="p-2">{mins(balance.usedThisMonth)}</td>
                <td className="p-2">{plan ? mins(balance.bankedMinutes) : '—'}</td>
                <td className="p-2">{packMinutes}</td>
                <td className="p-2">{money(periodCost)}</td>
                <td className="p-2">{plan ? money(plan.monthlyUsd) : '—'}</td>
                <td className="p-2">{preset === 'month' && plan ? money(plan.monthlyUsd - periodCost) : '—'}</td>
                <td className="p-2">
                  {state === null ? '—' : state === 'ok'
                    ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-600">OK</span>
                    : state === 'warn80'
                      ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-600">80%</span>
                      : <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-medium text-red-600">100%+</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!clientRows.length && !loading && <p className="py-6 text-muted-foreground">No clients found.</p>}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Costs are published-rate estimates, not provider invoices. Chat / website brain rows are platform
        scan AI and are unattributed to any client. Email history predates logging — email usage starts
        when the reports engine runs. “Margin (this month)” is only shown for the This month range, so it
        always compares a full plan month against that same month's estimated cost.
      </p>
    </section>
  );
}
