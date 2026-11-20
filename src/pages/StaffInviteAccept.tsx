import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLockup } from "@/components/BrandLogo";
import { toast } from "sonner";

// Staff invite acceptance (RBAC Phase 1, 2026-11-20). The link
// carries the raw token; the server stores only its SHA-256 hash
// (staff_invites, the tenant_invites pattern). Preview works
// signed-out and reveals only the role name + status. Accepting
// requires a signed-in account whose email matches the invite —
// enforced server-side by the voice-agents staffInviteAccept action,
// which writes the assignment through the guarded assign_staff_role
// RPC. This page just drives the flow, like InviteAccept does for
// tenant invites.

interface Preview { roleName: string; status: string }

const StaffInviteAccept = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");

  useEffect(() => {
    if (!token) return;
    void supabase.functions
      .invoke("voice-agents", { body: { action: "staffInvitePreview", inviteToken: token } })
      .then(({ data, error }) => {
        if (error || !(data as { preview?: Preview })?.preview) {
          setPreviewError((data as { error?: string })?.error || t("team.invitePage.invalid"));
          return;
        }
        setPreview((data as { preview: Preview }).preview);
      })
      .catch(() => setPreviewError(t("team.invitePage.invalid")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const auth = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) {
      toast.error(mode === "signup" ? t("team.invitePage.signupFailed") : t("team.invitePage.signinFailed"), {
        description: result.error.message,
      });
      return;
    }
    if (mode === "signup" && !result.data.session) {
      toast.success(t("team.invitePage.confirmEmail"));
      return;
    }
    toast.success(t("team.invitePage.signedIn"));
  };

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("voice-agents", {
      body: { action: "staffInviteAccept", inviteToken: token },
    });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error(t("team.invitePage.acceptFailed"), { description: (data as { error?: string })?.error });
      return;
    }
    toast.success(t("team.invitePage.welcome"));
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-3">
          <BrandLockup />
          <CardTitle className="text-lg">{t("team.invitePage.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewError ? (
            <p role="alert" className="text-sm text-muted-foreground">{previewError}</p>
          ) : !preview ? (
            <p className="text-sm text-muted-foreground">{t("team.invitePage.checking")}</p>
          ) : preview.status !== "pending" ? (
            <p className="text-sm text-muted-foreground">
              {preview.status === "expired" ? t("team.invitePage.expired") : t("team.invitePage.unavailable")}
            </p>
          ) : (
            <>
              <p className="text-sm">
                {t("team.invitePage.intro")} <strong>{preview.roleName}</strong>.
              </p>
              {session ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("team.invitePage.signedInAs", { email: session.user.email })}
                  </p>
                  <Button className="w-full" disabled={busy} onClick={() => void accept()}>
                    {busy ? t("team.invitePage.accepting") : t("team.invitePage.accept")}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => void supabase.auth.signOut()}>
                    {t("team.invitePage.signOutDifferent")}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex gap-2 text-xs">
                    <Button size="sm" variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>
                      {t("team.invitePage.createAccount")}
                    </Button>
                    <Button size="sm" variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>
                      {t("team.invitePage.haveAccount")}
                    </Button>
                  </div>
                  <form onSubmit={(e) => void auth(e)} className="space-y-3">
                    <Input type="email" autoComplete="email" placeholder={t("team.invitePage.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <Input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={t("team.invitePage.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? t("team.invitePage.working") : mode === "signup" ? t("team.invitePage.createAndContinue") : t("team.invitePage.signinAndContinue")}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffInviteAccept;
