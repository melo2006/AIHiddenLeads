import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MailPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ClientsView from '@/components/crm/ClientsView';
import BrandingSettings from '@/components/crm/BrandingSettings';
import type { OrgBranding } from '@/lib/clients';
import type { TenantLimits } from '@/lib/tenancy';

// Reseller console (multi-tenant design Phase 2, 2026-11-18 §5): the
// reseller's own scoped home — his clients, his branding, his team and
// invites, his usage against the limits the platform set, and HIS
// effective prices. Everything comes from the voice-agents
// `resellerConsole` action, which resolves his subtree server-side.
// He never sees: other tenants, platform settings, platform retail
// prices, our costs, or any vendor name.

interface ConsoleData {
  organization: { id: string; name: string; type: string; status: string; branding: OrgBranding };
  limits: TenantLimits;
  caps: Record<string, string>;
  usage: { minutes: number; spendUsd: number; demoSpendUsd: number; clientCount: number };
  prices: { key: string; label: string; unit: string; priceUsd: number }[];
  invites: { id: string; kind: string; email: string; company_name: string | null; role: string; status: string; expires_at: string; email_sent: boolean }[];
  brandingComplete: boolean;
}

const UNIT_LABELS: Record<string, string> = {
  minute: 'per minute', creation: 'per creation', scan: 'per scan', per_1000: 'per 1,000',
  segment: 'per segment', number_month: 'per number / month', message: 'per message', prospect: 'per prospect',
};
const money = (v: number) => (v < 0.1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);

function CapLine({ label, used, cap, state, format }: { label: string; used: string; cap: number | null; state: string; format?: (n: number) => string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span>{used}{cap !== null ? ` of ${format ? format(cap) : cap}` : ''}</span>
        {state === 'blocked' && <Badge variant="destructive" className="text-[10px]">At limit</Badge>}
        {state === 'warning' && <Badge variant="secondary" className="text-[10px]">Near limit</Badge>}
        {cap === null && <span className="text-xs text-muted-foreground">No limit set</span>}
      </span>
    </div>
  );
}

function InviteForm({ kind, organizationId, disabled, disabledReason, onDone }: {
  kind: 'client' | 'staff';
  organizationId: string;
  disabled?: boolean;
  disabledReason?: string;
  onDone: () => void;
}) {
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; emailSent: boolean } | null>(null);

  const submit = async () => {
    if (!email.trim() || (kind === 'client' && !company.trim())) {
      toast.error(kind === 'client' ? 'Business name and email are required.' : 'Email is required.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('voice-agents', {
      body: {
        action: 'inviteCreate', inviteKind: kind, organizationId,
        companyName: kind === 'client' ? company.trim() : undefined,
        userEmail: email.trim(), inviteRole: kind === 'staff' ? role : undefined,
      },
    });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error('Could not create the invite.', { description: (data as { error?: string })?.error });
      return;
    }
    const result = data as { inviteUrl: string; emailSent: boolean };
    setLink({ url: result.inviteUrl, emailSent: result.emailSent });
    toast.success(result.emailSent ? 'Invite sent.' : 'Invite created — copy the link below and send it yourself (email could not go out).');
    setCompany(''); setEmail('');
    onDone();
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
        <MailPlus className="h-4 w-4" /> {kind === 'client' ? 'Invite a client' : 'Invite a team member'}
      </p>
      {disabled ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {kind === 'client' && (
              <Input className="h-9 w-56 text-sm" placeholder="Business name" value={company} onChange={(e) => setCompany(e.target.value)} />
            )}
            <Input className="h-9 w-64 text-sm" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {kind === 'staff' && (
              <select aria-label="Team role" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            )}
            <Button size="sm" className="h-9" disabled={busy} onClick={() => void submit()}>Send invite</Button>
          </div>
          {link && (
            <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs">
              <p className="mb-1">{link.emailSent ? 'Email sent. The invite link (also copyable):' : 'Email did not go out — copy this link and send it yourself:'}</p>
              <code className="break-all">{link.url}</code>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const ResellerConsole = ({ organizationId }: { organizationId?: string }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['reseller-console', organizationId ?? 'default'],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.functions.invoke('voice-agents', {
        body: { action: 'resellerConsole', ...(organizationId ? { organizationId } : {}) },
      });
      if (e) throw e;
      if ((d as { error?: string })?.error) throw new Error((d as { error?: string }).error);
      return d as ConsoleData;
    },
  });

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading your console…</div>;
  if (error || !data) return <p role="alert" className="py-8 text-center text-sm text-muted-foreground">Console unavailable.</p>;

  const org = data.organization;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['reseller-console'] });
    void queryClient.invalidateQueries({ queryKey: ['tenant-clients'] });
  };

  const revoke = async (id: string) => {
    const { error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'inviteRevoke', inviteId: id } });
    if (e) { toast.error('Could not revoke the invite.'); return; }
    toast.success('Invite revoked.');
    refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{org.name} — Console</h2>
        <p className="text-xs text-muted-foreground">Your clients, your brand, your team. Everything here is yours alone.</p>
      </div>

      {!data.brandingComplete && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Finish your branding setup first.</p>
          <p className="mt-1 text-xs">
            Add your logo in the Branding tab — your clients see your brand, so client invites open once your logo is set.
          </p>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="mb-3 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="team">Team & invites</TabsTrigger>
          <TabsTrigger value="prices">Your prices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <p className="mb-2 text-sm font-medium">This month</p>
              <CapLine label="Clients" used={String(data.usage.clientCount)} cap={data.limits.maxClients} state={data.caps.clients} />
              <CapLine label="Minutes used" used={String(data.usage.minutes)} cap={data.limits.minutesPool} state={data.caps.minutes} />
              <CapLine label="Demo spend" used={money(data.usage.demoSpendUsd)} cap={data.limits.demoBudgetUsd} state={data.caps.demoSpend} format={(n) => money(n)} />
              <CapLine label="Total spend" used={money(data.usage.spendUsd)} cap={data.limits.monthlySpendCapUsd} state={data.caps.spend} format={(n) => money(n)} />
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="mb-2 text-sm font-medium">Your brand</p>
              <div className="flex items-center gap-3">
                {org.branding.logoUrl
                  ? <img src={org.branding.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  : <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-sm font-bold">{org.name.slice(0, 1)}</span>}
                <div className="min-w-0">
                  <p className="truncate font-medium">{org.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{org.branding.slogan || 'No slogan yet'}</p>
                  <p className="truncate text-xs text-muted-foreground">{org.branding.supportEmail || 'No support email yet'}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {data.brandingComplete ? 'Your clients see this brand in their dashboard header.' : 'Add a logo in the Branding tab to turn on your white-label header.'}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="clients">
          <div className="space-y-4">
            <InviteForm kind="client" organizationId={org.id} disabled={!data.brandingComplete}
              disabledReason="Client invites open once your branding is set up — add your logo in the Branding tab first. Your brand is what your clients are buying."
              onDone={refresh} />
            <ClientsView scope="reseller" />
          </div>
        </TabsContent>

        <TabsContent value="branding">
          <BrandingSettings organizationId={org.id} organizationName={org.name} initial={org.branding} onSaved={refresh} />
        </TabsContent>

        <TabsContent value="team">
          <div className="space-y-4">
            <InviteForm kind="staff" organizationId={org.id} onDone={refresh} />
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Invite</th>
                    <th className="px-4 py-2 font-medium">For</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-2 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.invites.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No invites yet.</td></tr>
                  ) : data.invites.map((i) => (
                    <tr key={i.id} className="border-b border-border">
                      <td className="px-4 py-3">{i.email}</td>
                      <td className="px-4 py-3">{i.kind === 'client' ? (i.company_name || 'Client') : `Team · ${i.role}`}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{i.status}</Badge></td>
                      <td className="px-4 py-3">{i.email_sent ? 'Sent' : 'Link only'}</td>
                      <td className="px-2 py-3">
                        {i.status === 'pending' && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => void revoke(i.id)}>
                            <Trash2 className="mr-1 h-3 w-3" /> Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prices">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Your wholesale prices for metered services. What you charge your own clients is entirely your business —
              you set those prices yourself, and they never appear here.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Service</th>
                    <th className="px-4 py-2 font-medium">Your price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prices.map((p) => (
                    <tr key={p.key} className="border-b border-border">
                      <td className="px-4 py-3">{p.label}</td>
                      <td className="px-4 py-3">{money(p.priceUsd)} <span className="text-xs text-muted-foreground">{UNIT_LABELS[p.unit] ?? p.unit}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ResellerConsole;
