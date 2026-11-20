import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Dedicated password-reset request page (2026-11-20). Replaces the old
// sign-in form button that silently depended on whatever was typed in
// the email field above it and stranded the owner on "Password recovery
// requires an email". This page owns exactly one job: collect an email,
// ask Supabase to send the recovery link, and say clearly what happened.
const ResetPassword = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target || busy) return;
    setBusy(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      target,
      { redirectTo: `${window.location.origin}/update-password` }
    );
    setBusy(false);
    if (resetError) {
      setError(t("passwordReset.request.error"));
      return;
    }
    setSentTo(target);
  };

  return (
    <main className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <img src="/logo.png" alt="AI Hidden Leads" className="mx-auto h-12 w-12" />
        {sentTo ? (
          <div className="space-y-3 text-center">
            <h1 className="text-lg font-semibold">
              {t("passwordReset.request.successTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("passwordReset.request.successBody", { email: sentTo })}
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/account">{t("passwordReset.request.backToSignIn")}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">
              {t("passwordReset.request.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("passwordReset.request.subtitle")}
            </p>
            <form className="space-y-3" onSubmit={submit}>
              <label className="block text-sm">
                {t("passwordReset.request.emailLabel")}
                <Input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <Button disabled={busy} type="submit" className="w-full">
                {busy
                  ? t("passwordReset.request.sending")
                  : t("passwordReset.request.sendButton")}
              </Button>
            </form>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button variant="ghost" className="w-full" asChild>
              <Link to="/account">{t("passwordReset.request.backToSignIn")}</Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
};

export default ResetPassword;
