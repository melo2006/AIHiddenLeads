import { Routes, Route, useNavigate, Navigate, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function TabbedPage({ tabs }: { tabs: { id: string; label: string; el: ReactNode }[] }) {
  const [params, setParams] = useSearchParams();
  const active = tabs.some((t) => t.id === params.get("tab")) ? params.get("tab")! : tabs[0].id;
  return (
    <Tabs value={active} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
      <TabsList className="mb-3">{tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}</TabsList>
      {tabs.map((t) => <TabsContent key={t.id} value={t.id}>{t.el}</TabsContent>)}
    </Tabs>
  );
}
import { type FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AccountMenu from "@/components/AccountMenu";
import SetupWizard from "@/components/setup-wizard/SetupWizard";
import VideoAvatarsView from "@/components/crm/VideoAvatarsView";
import TelephonyAdminView from "@/components/crm/TelephonyAdminView";
import { Link } from "react-router-dom";
import { CRMSidebar } from "@/components/crm/CRMSidebar";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import CRMDashboard from "@/components/crm/CRMDashboard";
import FollowUpIntelligence from "@/components/crm/FollowUpIntelligence";
import ProspectsView from "@/components/crm/ProspectsView";
import IntentLeadsView from "@/components/crm/IntentLeadsView";
import CampaignsView from "@/components/crm/CampaignsView";
import CampaignDetailView from "@/components/crm/CampaignDetailView";
import PipelinePageView from "@/components/crm/PipelinePageView";
import TemplatesView from "@/components/crm/TemplatesView";
import VoiceAgentsView from "@/components/crm/VoiceAgentsView";
import VoiceCostsView from "@/components/crm/VoiceCostsView";
import CallHistoryView from "@/components/crm/CallHistoryView";
import DemoSessionsView from "@/components/crm/DemoSessionsView";
import ImportedListsView from "@/components/crm/ImportedListsView";
import ImportedListDetailView from "@/components/crm/ImportedListDetailView";
import EngagementDashboard from "@/components/crm/EngagementDashboard";
import CampaignResultsView from '@/components/crm/CampaignResultsView';
import SMSDashboard from "@/components/crm/SMSDashboard";
import AdHijack from "@/pages/AdHijack";

const ADMIN_EMAIL = "melo2006@gmail.com";

const AdminLogin = ({ onSignedIn }: { onSignedIn: () => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const inIframe = typeof window !== "undefined" && window.self !== window.top;

  const handleGoogleLogin = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
      extraParams: { prompt: "select_account" },
    });
    setLoading(false);

    if (result.error) {
      const message = result.error.message || "";
      const canceled = /cancel|closed|popup|blocked/i.test(message);
      toast.error(canceled ? "Google sign-in canceled" : "Google sign-in failed", {
        description: canceled
          ? inIframe
            ? "The Google popup was blocked or closed. Open the app in its own browser tab and sign in there, or use the email + password form below."
            : "The Google window was closed before finishing. Try again, or use the email + password form below."
          : message,
      });
      return;
    }

    if (result.redirected) {
      // Browser is redirecting to Google; nothing more to do here.
      return;
    }

    // Tokens were returned directly (e.g., in the Lovable preview iframe).
    toast.success("Signed in with Google");
    onSignedIn();
    navigate("/dashboard/calls", { replace: true });
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast.error("Admin sign-in failed", { description: error.message });
      return;
    }

    toast.success("Signed in");
    onSignedIn();
    navigate("/dashboard/calls", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="AI Hidden Leads" className="h-10 w-10" />
            <span className="text-base font-extrabold tracking-tight text-foreground">
              AI <span className="text-primary">Hidden</span> Leads
            </span>
          </div>
          <CardTitle className="text-lg">Admin sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Button type="button" className="w-full" onClick={handleGoogleLogin} disabled={loading}>
              Continue with Google
            </Button>
            {inIframe && (
              <a
                href={`${window.location.origin}/dashboard`}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-primary underline"
              >
                Google popup blocked? Open sign-in in a new tab
              </a>
            )}
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              Or email
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>
          <form onSubmit={handleLogin} className="mt-3 space-y-3">
            <Input
              type="email"
              autoComplete="email"
              placeholder="Admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in to view history"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const CRM = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [voiceAccess, setVoiceAccess] = useState(false);
  const [voiceAdmin, setVoiceAdmin] = useState(false);
  const [rolesReady, setRolesReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    setRolesReady(false);
    if (!session) { setVoiceAccess(false); setVoiceAdmin(false); setRolesReady(true); return; }
    Promise.all([supabase.from('voice_platform_roles').select('role').eq('user_id', session.user.id), supabase.from('voice_memberships').select('id').eq('user_id', session.user.id).eq('role','editor')]).then(([roles,members]) => {
      if (!active) return;
      setVoiceAdmin(Boolean(roles.data?.some(r => r.role === 'admin')));
      setVoiceAccess(Boolean(members.data?.length)); setRolesReady(true);
    });
    return () => { active = false; };
  }, [session?.user.id]);

  if (!authReady || (session && !rolesReady)) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading admin...</div>;
  }

  if (!session) {
    return <AdminLogin onSignedIn={() => {}} />;
  }

  const userEmail = session.user.email?.toLowerCase();
  if (!voiceAdmin && !voiceAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm border-border bg-card">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="AI Hidden Leads" className="h-10 w-10" />
              <span className="text-base font-extrabold tracking-tight text-foreground">
                AI <span className="text-primary">Hidden</span> Leads
              </span>
            </div>
            <CardTitle className="text-lg">Access restricted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You're signed in as <strong className="text-foreground">{userEmail}</strong>. This area is for AI Hidden Leads staff. Your business assistant, setup and subscription are in your own dashboard.
            </p>
            <Button asChild className="w-full"><Link to="/account">Go to my dashboard</Link></Button>
            <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}>
              Sign out and try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!voiceAdmin && voiceAccess) return <div className="min-h-screen bg-background text-foreground"><header className="sticky top-0 flex h-14 items-center justify-between border-b border-border bg-background px-4"><span className="font-bold">AI Hidden Leads · Voice Agents</span><Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>Sign out</Button></header><main className="p-4 sm:p-6"><VoiceAgentsView /></main></div>;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <CRMSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
            <div className="flex h-14 items-center gap-2 px-4">
              <Link to="/" className="flex min-w-0 items-center gap-2">
                <img src="/logo.png" alt="AI Hidden Leads" className="h-9 w-9" />
                <span className="truncate text-lg font-extrabold tracking-tight text-foreground">AI <span className="text-primary">Hidden</span> Leads</span>
              </Link>
              <div className="ml-auto"><AccountMenu /></div>
            </div>
            <div className="flex h-9 items-center border-t border-border/60 px-2">
              <SidebarTrigger className="h-8 w-8" aria-label="Toggle menu" /><span className="text-xs text-muted-foreground">Menu</span>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            <Routes>
              <Route index element={<CRMDashboard />} />
              <Route path="prospects" element={<ProspectsView />} />
              <Route path="intent-leads" element={<IntentLeadsView />} />
              <Route path="campaigns" element={<CampaignsView />} />
              <Route path="campaigns/:id" element={<CampaignDetailView />} />
              <Route path="pipeline" element={<PipelinePageView />} />
              <Route path="calls" element={<Navigate to="/dashboard/sessions?tab=calls" replace />} />
              <Route path="sessions" element={<TabbedPage tabs={[{ id: "demos", label: "Demo sessions", el: <DemoSessionsView /> }, { id: "calls", label: "Call history", el: <CallHistoryView /> }]} />} />
              <Route path="imported" element={<ImportedListsView />} />
              <Route path="imported/:id" element={<ImportedListDetailView />} />
              <Route path="engagement" element={<Navigate to="/dashboard/campaign-results?tab=engagement" replace />} />
              <Route path="campaign-results" element={<TabbedPage tabs={[{ id: "results", label: "Campaign results", el: <CampaignResultsView /> }, { id: "engagement", label: "Engagement", el: <EngagementDashboard /> }]} />} />
              <Route path="sms" element={<SMSDashboard />} />
              <Route path="follow-up" element={<FollowUpIntelligence />} />
              <Route path="templates" element={<TemplatesView />} />
              <Route path="ad-hijack" element={<AdHijack />} />
              <Route path="voice-agents" element={<VoiceAgentsView />} />
              <Route path="voice-costs" element={<VoiceCostsView />} />
              <Route path="guardrails" element={<Navigate to="/dashboard/voice-costs#limits" replace />} />
              <Route path="wizard-preview" element={<SetupWizard preview />} />
              <Route path="video-avatars" element={<VideoAvatarsView />} />
              <Route path="telephony" element={<TelephonyAdminView />} />
              <Route path="*" element={<CRMDashboard />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CRM;
