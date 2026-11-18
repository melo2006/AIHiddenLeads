import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, MailPlus, Save, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FEATURE_KEYS, type TenantLimits } from '@/lib/tenancy';
import { effectivePrice, type RateCardLine } from '@/lib/rateCard';
import { formatMoney } from '@/lib/currency';
import type { RetailPriceLine } from '@/lib/retailPricing';

// Tenants — the platform admin's reseller screen (multi-tenant design
// Phase 2, 2026-11-18): every organization with its type and status,
// client counts, this month's metered usage and demo spend (from the
// usage ledger, rolled up per subtree server-side), and the LIMITS
// EDITOR that writes feature_limits + rate_card_overrides. Inviting a
// reseller creates their org pre-named plus a pending invite; the
// invite link is always shown so it can be copied when email can't go
// out — a send is never faked.

export const FEATURE_LABELS: Record<string, string> = {
  voiceAgents: 'Voice agents',
  videoAvatar: 'Video avatar',
  voiceCloning: 'Voice cloning',
  phoneNumbers: 'Phone numbers',
  sms: 'SMS',
  emailSending: 'Email sending',
  leadGen: 'Lead generation / CRM',
};

interface TenantRow {
  id: string;
  name: string;
  type: string;
  status: string;
  /** Phase 2.5: seeded presentation org — excluded from real billing. */
  isDemo?: boolean;
  parentOrganizationId: string | null;
  parentName: string | null;
  branding: { logoUrl: string | null; slogan: string | null; supportEmail: string | null; brandColor: string | null };
  limits: TenantLimits;
  rateCardOverrides: Record<string, { mode?: string; markupPct?: number; flatUsd?: number }>;
  clientCount: number;
  monthMinutes: number;
  monthSpendUsd: number;
  monthDemoSpendUsd: number;
  caps: Record<string, string>;
  brandingComplete: boolean;
}

const money = (v: number) => `$${v.toFixed(2)}`;
const capBadge = (state: string) =>
  state === 'blocked' ? <Badge variant="destructive" className="text-[10px]">At limit</Badge>
  : state === 'warning' ? <Badge variant="secondary" className="text-[10px]">Near limit</Badge>
  : null;

function LimitsEditor({ tenant, card, onSaved }: { tenant: TenantRow; card: RateCardLine[]; onSaved: () => void }) {
  const [maxClients, setMaxClients] = useState(tenant.limits.maxClients?.toString() ?? '');
  const [minutesPool, setMinutesPool] = useState(tenant.limits.minutesPool?.toString() ?? '');
  const [demoBudget, setDemoBudget] = useState(tenant.limits.demoBudgetUsd?.toString() ?? '');
  const [spendCap, setSpendCap] = useState(tenant.limits.monthlySpendCapUsd?.toString() ?? '');
  const [features, setFeatures] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FEATURE_KEYS.map((k) => [k, tenant.limits.features[k] !== false])));
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(card.map((l) => {
      const o = tenant.rateCardOverrides[l.key];
      return [l.key, o ? (o.mode === 'flat' ? String(o.flatUsd ?? '') : String(o.markupPct ?? '')) : ''];
    })));
  const [overrideModes, setOverrideModes] = useState<Record<string, string>>(() =>
    Object.fromEntries(card.map((l) => [l.key, tenant.rateCardOverrides[l.key]?.mode ?? l.mode])));
  const [busy, setBusy] = useState(false);

  const numOrNull = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : undefined; // undefined = invalid
  };

  const save = async () => {
    const limits: TenantLimits = {
      maxClients: numOrNull(maxClients) ?? null,
      minutesPool: numOrNull(minutesPool) ?? null,
      demoBudgetUsd: numOrNull(demoBudget) ?? null,
      monthlySpendCapUsd: numOrNull(spendCap) ?? null,
      features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, features[k] !== false])),
    };
    if ([maxClients, minutesPool, demoBudget, spendCap].some((s) => numOrNull(s) === undefined)) {
      toast.error('Limits must be non-negative numbers (or empty for unlimited).');
      return;
    }
    const rateCard: Record<string, unknown> = {};
    for (const line of card) {
      const raw = (overrides[line.key] ?? '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { toast.error(`Override for ${line.label} must be a non-negative number.`); return; }
      rateCard[line.key] = overrideModes[line.key] === 'flat' ? { mode: 'flat', flatUsd: n } : { mode: 'markup', markupPct: n };
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('voice-agents', {
      body: { action: 'updateTenant', organizationId: tenant.id, limits, rateCard },
    });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error('Could not save limits.', { description: (data as { error?: string })?.error });
      return;
    }
    toast.success(`Limits saved for ${tenant.name}.`);
    onSaved();
  };

  const toggleStatus = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('voice-agents', {
      body: { action: 'updateTenant', organizationId: tenant.id, status: tenant.status === 'suspended' ? 'active' : 'suspended' },
    });
    setBusy(false);
    if (error) { toast.error('Could not change status.'); return; }
    toast.success(tenant.status === 'suspended' ? `${tenant.name} reactivated.` : `${tenant.name} suspended.`);
    onSaved();
  };

  const field = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <label className="block min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" placeholder="Unlimited" className="mt-1 h-8 text-xs" />
      <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field('Max clients', maxClients, setMaxClients, 'Client businesses under this tenant')}
        {field('Minutes pool / month', minutesPool, setMinutesPool, 'Voice + avatar minutes, whole subtree')}
        {field('Demo budget $ / month', demoBudget, setDemoBudget, 'Demo spend stops at this amount')}
        {field('Spend cap $ / month', spendCap, setSpendCap, 'Master fuse on all metered spend')}
      </div>
      <p className="text-[11px] text-muted-foreground">Caps warn at 80% and hard-stop at 100%. Empty = unlimited.</p>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Features</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {FEATURE_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={features[k] !== false} onChange={(e) => setFeatures((f) => ({ ...f, [k]: e.target.checked }))} />
              {FEATURE_LABELS[k]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Rate card overrides for this tenant</p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Blank = platform rate card price. An override replaces the mode and value for that line, for this tenant only.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {card.map((line) => (
            <div key={line.key} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs" title={line.label}>{line.label}
                <span className="text-muted-foreground"> · card {money(effectivePrice(line))}</span>
              </span>
              <select aria-label={`${line.label} override mode`} className="h-8 rounded-md border border-border bg-background px-1 text-xs"
                value={overrideModes[line.key]} onChange={(e) => setOverrideModes((m) => ({ ...m, [line.key]: e.target.value }))}>
                <option value="markup">% markup</option>
                <option value="flat">Flat $</option>
              </select>
              <Input aria-label={`${line.label} override value`} className="h-8 w-20 text-xs" inputMode="decimal" placeholder="—"
                value={overrides[line.key]} onChange={(e) => setOverrides((o) => ({ ...o, [line.key]: e.target.value }))} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}><Save className="mr-1 h-3 w-3" /> Save limits</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleStatus()}>
          {tenant.status === 'suspended' ? 'Reactivate tenant' : 'Suspend tenant'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 2.5 (design §12.1 + §12.3): the demo-data panel and the
// read-only retail summary. Demo orgs are seeded presentation data —
// flagged is_demo server-side, carrying their figures in demo_profile,
// never in the usage ledger — so they can be presented at all three
// levels and removed in one click. A reseller's retail setup is HIS
// business (§8 decision 5): the platform can look, never edit.
// ---------------------------------------------------------------------------
interface DemoStatus { seeded: boolean; resellerName: string | null; clientCount: number }
interface DemoCredential { label: string; email: string; password: string }

function DemoDataPanel({ onChanged }: { onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'seed' | 'remove' | null>(null);
  const [credentials, setCredentials] = useState<DemoCredential[] | null>(null);
  const { data: status } = useQuery({
    queryKey: ['demo-status'],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'demoStatus' } });
      if (e) throw e;
      if ((d as { error?: string })?.error) throw new Error((d as { error: string }).error);
      return d as DemoStatus;
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['demo-status'] });
    await queryClient.invalidateQueries({ queryKey: ['tenants'] });
    onChanged();
  };

  const seed = async () => {
    setBusy('seed');
    const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'seedDemoData' } });
    setBusy(null);
    if (e || (d as { error?: string })?.error) {
      toast.error('Could not seed demo data.', { description: (d as { error?: string })?.error });
      return;
    }
    setCredentials((d as { credentials: DemoCredential[] }).credentials);
    toast.success('Demo data seeded — save the sign-in passwords below; they are shown only once.');
    await refresh();
  };

  const remove = async () => {
    setBusy('remove');
    const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'removeDemoData' } });
    setBusy(null);
    if (e || (d as { error?: string })?.error) {
      toast.error('Could not remove demo data.', { description: (d as { error?: string })?.error });
      return;
    }
    setCredentials(null);
    const removed = (d as { removed: { orgs: number; users: number } }).removed;
    toast.success(`Demo data removed (${removed.orgs} organizations, ${removed.users} accounts).`);
    await refresh();
  };

  return (
    <div className="rounded-lg border border-dashed border-border p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4" /> Demo / presentation data</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Seeds a complete demo world — a reseller (NorthPeak Partners) with branding, selling prices and four
        believable client businesses — so all three levels (your admin, the reseller console, a client dashboard)
        can be presented with real-looking numbers. Demo organizations are flagged and never mix with real
        billing or usage. Re-seeding refreshes the world; it never duplicates it.
      </p>
      <p className="mb-3 text-xs">
        {status?.seeded
          ? <>Currently seeded: <span className="font-medium">{status.resellerName}</span> with {status.clientCount} demo clients.</>
          : 'Not seeded right now.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-9" disabled={busy !== null} onClick={() => void seed()}>
          <Sparkles className="mr-1 h-3 w-3" /> {status?.seeded ? 'Re-seed (refresh) demo data' : 'Seed demo data'}
        </Button>
        <Button size="sm" variant="outline" className="h-9" disabled={busy !== null || !status?.seeded} onClick={() => void remove()}>
          <Trash2 className="mr-1 h-3 w-3" /> Remove demo data
        </Button>
      </div>
      {credentials && (
        <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs">
          <p className="mb-2 font-medium">Demo sign-ins — save these now; the passwords are shown only once, right after seeding.</p>
          <ul className="space-y-1">
            {credentials.map((c) => (
              <li key={c.email} className="break-all">
                <span className="text-muted-foreground">{c.label}:</span> <code>{c.email}</code> · <code>{c.password}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface TenantRetailPayload { lines: RetailPriceLine[]; customerCurrency: string; readOnly?: boolean }

function RetailSummary({ tenant }: { tenant: TenantRow }) {
  const { data } = useQuery({
    queryKey: ['tenant-retail', tenant.id],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.functions.invoke('voice-agents', {
        body: { action: 'tenantRetail', organizationId: tenant.id },
      });
      if (e) throw e;
      if ((d as { error?: string })?.error) throw new Error((d as { error: string }).error);
      return d as TenantRetailPayload;
    },
  });
  if (!data) return null;
  const modeNote = (l: RetailPriceLine) =>
    l.setting.mode === 'markup' ? `+${l.setting.markupPct}% markup`
    : l.setting.mode === 'flat' ? 'flat price'
    : `cost + ${formatMoney(l.setting.addonUsd, 'USD')}`;
  return (
    <div className="border-b border-border px-4 py-4">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">His selling prices (read-only)</p>
      <p className="mb-2 text-[11px] text-muted-foreground">
        What this reseller charges his own customers, and what he pays us. His customers see prices in{' '}
        {data.customerCurrency}; he always settles with us in USD. His prices are his business — view only.
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {data.lines.map((l) => (
          <p key={l.key} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate" title={l.label}>{l.label}</span>
            <span className="shrink-0 tabular-nums">
              {formatMoney(l.wholesaleUsd, 'USD')} → <span className="font-medium">{formatMoney(l.retailUsd, 'USD')}</span>
              <span className="text-muted-foreground"> ({modeNote(l)})</span>
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

const TenantsView = () => {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ url: string; emailSent: boolean } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'tenants' } });
      if (e) throw e;
      return (d?.tenants ?? []) as TenantRow[];
    },
  });
  const { data: card } = useQuery({
    queryKey: ['rate-card'],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'rateCard' } });
      if (e) throw e;
      return (d?.rateCard ?? []) as RateCardLine[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);
  const resellers = rows.filter((r) => r.type === 'reseller');

  const inviteReseller = async () => {
    if (!company.trim() || !email.trim()) { toast.error('Company name and email are required.'); return; }
    setInviting(true);
    const { data: d, error: e } = await supabase.functions.invoke('voice-agents', {
      body: { action: 'inviteCreate', inviteKind: 'reseller', companyName: company.trim(), userEmail: email.trim() },
    });
    setInviting(false);
    if (e || (d as { error?: string })?.error) {
      toast.error('Could not create the invite.', { description: (d as { error?: string })?.error });
      return;
    }
    const result = d as { inviteUrl: string; emailSent: boolean };
    setLastInvite({ url: result.inviteUrl, emailSent: result.emailSent });
    toast.success(result.emailSent ? 'Reseller invited — email sent.' : 'Invite created — copy the link below and send it yourself (email could not go out).');
    setCompany(''); setEmail('');
    await queryClient.invalidateQueries({ queryKey: ['tenants'] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Tenants</h2>
        <p className="text-xs text-muted-foreground">
          Every reseller and client organization: status, clients, this month's usage and demo spend, and the limits you set for each.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium"><MailPlus className="h-4 w-4" /> Invite a reseller</p>
        <div className="flex flex-wrap gap-2">
          <Input className="h-9 w-56 text-sm" placeholder="Company name" value={company} onChange={(e) => setCompany(e.target.value)} />
          <Input className="h-9 w-64 text-sm" placeholder="Owner email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button size="sm" className="h-9" disabled={inviting} onClick={() => void inviteReseller()}>Create invite</Button>
        </div>
        {lastInvite && (
          <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs">
            <p className="mb-1">{lastInvite.emailSent ? 'Email sent. The invite link (also copyable):' : 'Email did not go out — copy this link and send it yourself:'}</p>
            <code className="break-all">{lastInvite.url}</code>
          </div>
        )}
      </div>

      <DemoDataPanel onChanged={() => void queryClient.invalidateQueries({ queryKey: ['clients'] })} />

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading tenants…</div>
      ) : error ? (
        <p role="alert" className="py-8 text-center text-sm text-muted-foreground">Tenants unavailable.</p>
      ) : !rows.length ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No organizations yet.</p>
          <p className="mt-1">Invite your first reseller above — their company is created pre-named, ready for their branding setup.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Clients</th>
                <th className="px-4 py-2 font-medium">Minutes (mo)</th>
                <th className="px-4 py-2 font-medium">Spend (mo)</th>
                <th className="px-4 py-2 font-medium">Demo spend</th>
                <th className="px-2 py-2" aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const expanded = expandedId === t.id;
                return [
                  <tr key={t.id} className="cursor-pointer border-b border-border hover:bg-muted/40" onClick={() => setExpandedId(expanded ? null : t.id)}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{t.name}{t.isDemo && <Badge variant="secondary" className="ml-2 text-[10px]">Demo</Badge>}</p>
                      {t.parentName && <p className="text-xs text-muted-foreground">under {t.parentName}</p>}
                      {t.type === 'reseller' && !t.brandingComplete && <p className="text-xs text-amber-600">Branding not set up yet</p>}
                    </td>
                    <td className="px-4 py-3">{t.type === 'reseller' ? 'Reseller' : 'Client'}</td>
                    <td className="px-4 py-3"><Badge variant={t.status === 'suspended' ? 'destructive' : 'outline'} className="text-[10px]">{t.status}</Badge></td>
                    <td className="px-4 py-3">{t.clientCount} {capBadge(t.caps.clients)}</td>
                    <td className="px-4 py-3">{t.monthMinutes} {capBadge(t.caps.minutes)}</td>
                    <td className="px-4 py-3">{money(t.monthSpendUsd)} {capBadge(t.caps.spend)}</td>
                    <td className="px-4 py-3">{money(t.monthDemoSpendUsd)} {capBadge(t.caps.demoSpend)}</td>
                    <td className="px-2 py-3 text-muted-foreground">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
                  </tr>,
                  expanded ? (
                    <tr key={`${t.id}-detail`} className="border-b border-border bg-card/50">
                      <td colSpan={8}>
                        {t.type === 'reseller' && <RetailSummary tenant={t} />}
                        <LimitsEditor tenant={t} card={card ?? []} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['tenants'] })} />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {!isLoading && !error && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">{resellers.length} reseller{resellers.length === 1 ? '' : 's'} · {rows.length - resellers.length} client organization{rows.length - resellers.length === 1 ? '' : 's'}.</p>
      )}
    </div>
  );
};

export default TenantsView;
