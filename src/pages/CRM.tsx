import { Routes, Route, useNavigate } from "react-router-dom";
import { type FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
              You signed in as <strong className="text-foreground">{userEmail}</strong>, but this admin console is only
              authorized for <strong className="text-foreground">{ADMIN_EMAIL}</strong>.
            </p>
            <Button className="w-full" onClick={() => supabase.auth.signOut()}>
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
          <header className="sticky top-0 z-40 h-14 flex items-center border-b border-border px-4 bg-background/95 backdrop-blur-sm">
            <SidebarTrigger className="mr-3" />
            <img src="/logo.png" alt="AI Hidden Leads" className="w-9 h-9 mr-2" />
            <span className="text-lg font-extrabold text-foreground tracking-tight">AI <span className="text-primary">Hidden</span> Leads</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 text-xs"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </Button>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            <Routes>
              <Route index element={<CRMDashboard />} />
              <Route path="prospects" element={<ProspectsView />} />
              <Route path="intent-leads" element={<IntentLeadsView />} />
              <Route path="campaigns" element={<CampaignsView />} />
              <Route path="campaigns/:id" element={<CampaignDetailView />} />
              <Route path="pipeline" element={<PipelinePageView />} />
              <Route path="calls" element={<CallHistoryView />} />
              <Route path="sessions" element={<DemoSessionsView />} />
              <Route path="imported" element={<ImportedListsView />} />
              <Route path="imported/:id" element={<ImportedListDetailView />} />
              <Route path="engagement" element={<EngagementDashboard />} />
              <Route path="campaign-results" element={<CampaignResultsView />} />
              <Route path="sms" element={<SMSDashboard />} />
              <Route path="follow-up" element={<FollowUpIntelligence />} />
              <Route path="templates" element={<TemplatesView />} />
              <Route path="ad-hijack" element={<AdHijack />} />
              <Route path="voice-agents" element={<VoiceAgentsView />} />
              <Route path="voice-costs" element={<VoiceCostsView />} />
              <Route path="guardrails" element={<Navigate to="/dashboard/voice-costs#limits" replace />} />
              <Route path="*" element={<CRMDashboard />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CRM;
