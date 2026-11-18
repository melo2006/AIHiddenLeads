import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/BrandLogo';
import VoiceAgentsView from '@/components/crm/VoiceAgentsView';
import ResellerConsole from '@/components/crm/ResellerConsole';

// TenantShell — the non-admin /dashboard shell (multi-tenant Phase 2,
// 2026-11-18). A user who manages a RESELLER org lands in the Reseller
// console; everyone else keeps the Phase 1-era Voice Agents shell,
// byte-for-byte the same as before. Which one applies is decided by
// the server's myTenancy answer, never by a client-side guess. The
// header wears the reseller's own brand when he has one (his clients
// never see this shell — they use /account).

interface Tenancy {
  managedResellers: string[];
  memberships: { organizationId: string; role: string; org: { id: string; name: string; branding: { logoUrl: string | null } } | null }[];
}

const TenantShell = () => {
  const [tenancy, setTenancy] = useState<Tenancy | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.functions.invoke('voice-agents', { body: { action: 'myTenancy' } }).then(({ data }) => {
      if (!active) return;
      setTenancy((data as Tenancy) ?? null);
      setReady(true);
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  const resellerId = tenancy?.managedResellers?.[0];
  const resellerOrg = resellerId ? tenancy?.memberships.find((m) => m.organizationId === resellerId)?.org : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 flex h-14 items-center justify-between border-b border-border bg-background px-4">
        <span className="flex min-w-0 items-center gap-2">
          {resellerOrg?.branding?.logoUrl ? (
            <>
              <img src={resellerOrg.branding.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              <span className="truncate font-bold">{resellerOrg.name}</span>
            </>
          ) : (
            <>
              <BrandMark className="h-8 w-8 shrink-0" />
              <span className="font-bold">AI Hidden Leads · Voice Agents</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Button asChild size="sm" variant="ghost"><Link to="/account">My dashboard</Link></Button>
          <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>Sign out</Button>
        </span>
      </header>
      <main className="p-4 sm:p-6">
        {resellerId ? <ResellerConsole organizationId={resellerId} /> : <VoiceAgentsView />}
      </main>
    </div>
  );
};

export default TenantShell;
