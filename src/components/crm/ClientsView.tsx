import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import {
  shapeClients, suggestProspectMatch,
  type ClientPayload, type ClientViewModel, type ProspectLite,
} from '@/lib/clients';

// Clients — the platform admin's answer to "where are my customers?"
// (multi-tenant / reseller design Phase 1, 2026-11-18). A paying
// customer lives in four records (auth user, subscription, workspace,
// agent); the voice-agents function's admin-only `clients` action joins
// them server-side and this view renders the result. The lead ->
// customer link (prospects.converted_organization_id) is read here and
// written here — always by an explicit admin click, never silently:
// the function only SUGGESTS a match by email.

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

interface ProspectsResult {
  prospects: ProspectLite[];
  /** False until the Phase 1 prospects migration is applied — the
   *  converted_* columns don't exist yet, so linking stays off and the
   *  view says so instead of failing. */
  linkable: boolean;
}

function ClientDetail({ client, prospects, linkable }: { client: ClientViewModel; prospects: ProspectLite[]; linkable: boolean }) {
  const queryClient = useQueryClient();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const linked = client.linkedProspectId ? prospects.find((p) => p.id === client.linkedProspectId) ?? null : null;
  const suggestion = useMemo(
    () => (!client.linkedProspectId ? suggestProspectMatch(client.email, prospects) : null),
    [client.linkedProspectId, client.email, prospects],
  );
  const unlinked = useMemo(() => prospects.filter((p) => !p.converted_organization_id), [prospects]);

  const writeLink = async (prospectId: string, organizationId: string | null) => {
    setBusy(true);
    const { error } = await supabase
      .from('prospects')
      .update({
        converted_organization_id: organizationId,
        converted_at: organizationId ? new Date().toISOString() : null,
      })
      .eq('id', prospectId);
    setBusy(false);
    if (error) {
      toast.error('Could not save the lead link.');
      return;
    }
    toast.success(organizationId ? 'Lead linked to this customer.' : 'Lead link removed.');
    await queryClient.invalidateQueries({ queryKey: ['clients'] });
    await queryClient.invalidateQueries({ queryKey: ['clients-prospects'] });
  };

  const facts: [string, string][] = [
    ['Email', client.email ?? '—'],
    ['Plan', client.planLabel],
    ['Price ID', client.planPriceId ?? '—'],
    ['Subscription status', client.statusLabel],
    ['Period ends', formatDate(client.currentPeriodEnd)],
    ['Joined', formatDate(client.joinedAt)],
    ['Tenant', client.tenantLabel],
    ['Organization status', client.organizationStatus],
    ['Environment', client.environment ?? '—'],
    ['Organization ID', client.organizationId],
    ['User ID', client.userId],
  ];

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="truncate text-xs" title={value}>{value}</p>
          </div>
        ))}
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assistant</p>
          {client.agentId ? (
            <Link to="/dashboard/voice-agents" className="text-xs text-primary underline">
              Open in Voice Agents
            </Link>
          ) : (
            <p className="text-xs">—</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Came from a lead?</p>
        {!linkable ? (
          <p className="text-xs text-muted-foreground">
            Lead linking turns on once the Phase 1 database update is applied — nothing is linked yet.
          </p>
        ) : linked ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>
              Linked lead: <strong>{linked.business_name}</strong>
            </span>
            <Link to="/dashboard/prospects" className="text-primary underline">View in Prospects</Link>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void writeLink(linked.id, null)}>
              <Unlink className="mr-1 h-3 w-3" /> Unlink
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {suggestion && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>
                  Possible match: <strong>{suggestion.business_name}</strong>
                  <span className="text-muted-foreground"> — same email as this customer</span>
                </span>
                <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void writeLink(suggestion.id, client.organizationId)}>
                  <Link2 className="mr-1 h-3 w-3" /> Link this lead
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Link to a lead"
                className="h-8 max-w-full rounded-md border border-border bg-background px-2 text-xs"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                <option value="">Link to a lead…</option>
                {unlinked.map((p) => (
                  <option key={p.id} value={p.id}>{p.business_name}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-[11px]"
                disabled={busy || !pick}
                onClick={() => pick && void writeLink(pick, client.organizationId)}
              >
                <Link2 className="mr-1 h-3 w-3" /> Link
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ClientsView = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: clients, isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke('voice-agents', { body: { action: 'clients' } });
      if (invokeError) throw invokeError;
      return shapeClients((data?.clients ?? []) as ClientPayload[]);
    },
  });

  const { data: prospectsResult } = useQuery({
    queryKey: ['clients-prospects'],
    retry: false,
    queryFn: async (): Promise<ProspectsResult> => {
      const rich = await supabase
        .from('prospects')
        .select('id,business_name,email,owner_email,converted_organization_id')
        .order('business_name');
      if (!rich.error) return { prospects: (rich.data ?? []) as ProspectLite[], linkable: true };
      const base = await supabase.from('prospects').select('id,business_name,email,owner_email').order('business_name');
      return { prospects: (base.data ?? []) as ProspectLite[], linkable: false };
    },
  });

  const prospects = prospectsResult?.prospects ?? [];
  const linkable = prospectsResult?.linkable ?? true;
  const rows = clients ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Clients</h2>
        <p className="text-xs text-muted-foreground">
          Every paying customer — the person, their business, their plan and where they came from.
        </p>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading clients…</div>
      ) : error ? (
        <p role="alert" className="py-8 text-center text-sm text-muted-foreground">Clients unavailable.</p>
      ) : !rows.length ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No paying customers yet.</p>
          <p className="mt-1">
            When someone buys a plan and their workspace is provisioned, they will appear here — with their
            plan, subscription status and the lead they came from.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Business</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Tenant</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-2 py-2" aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {rows.map((client) => {
                const expanded = expandedId === client.organizationId;
                return [
                  <tr
                    key={client.organizationId}
                    className="cursor-pointer border-b border-border hover:bg-muted/40"
                    onClick={() => setExpandedId(expanded ? null : client.organizationId)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{client.customerName}</p>
                      {client.email && client.email !== client.customerName && (
                        <p className="text-xs text-muted-foreground">{client.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">{client.businessName}</td>
                    <td className="px-4 py-3">{client.planLabel}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{client.statusLabel}</Badge>
                    </td>
                    <td className="px-4 py-3">{client.tenantLabel}</td>
                    <td className="px-4 py-3">{formatDate(client.joinedAt)}</td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </td>
                  </tr>,
                  expanded ? (
                    <tr key={`${client.organizationId}-detail`} className="border-b border-border bg-card/50">
                      <td colSpan={7}>
                        <ClientDetail client={client} prospects={prospects} linkable={linkable} />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ClientsView;
