import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import CustomerPageLayout from "@/components/CustomerPageLayout";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/ui/password-input";
import { Check } from "lucide-react";

type Phase = "checking" | "ready" | "invalid" | "done";

// Landing page for the password-recovery email link (2026-11-20). The
// link redirects here with a PKCE ?code= (or, for implicit links, hash
// tokens with type=recovery); the supabase client (detectSessionInUrl)
// exchanges it and fires PASSWORD_RECOVERY. We show the set-password
// form only once a recovery session exists — an expired or already-used
// link gets a clear dead-end with a route back to /reset-password
// instead of the old behaviour (the link dumped the owner on /setup
// with no way to set a password at all).
const UpdatePassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const settled = useRef(false);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const linkError =
      search.get("error_description") ||
      search.get("error") ||
      hash.get("error_description") ||
      hash.get("error");
    if (linkError) {
      settled.current = true;
      setPhase("invalid");
      return;
    }

    const markReady = () => {
      if (!settled.current) {
        settled.current = true;
        setPhase("ready");
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && search.get("code"))) {
        markReady();
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      // A session here is either the recovery session the client just
      // exchanged from the link, or a visitor who is already signed in
      // (for them this page simply works as a change-password form).
      if (data.session) markReady();
    });

    const timeout = window.setTimeout(() => {
      if (!settled.current) {
        settled.current = true;
        setPhase("invalid");
      }
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Password policy (Ron, 2026-11-20 — the professional-companies rule):
  // 8+ characters with at least one letter, one number and one special
  // character, shown live under the field with ticks as each rule is met.
  const rules = [
    { ok: password.length >= 8, label: t("passwordReset.update.ruleLength") },
    { ok: /[A-Za-z]/.test(password), label: t("passwordReset.update.ruleLetter") },
    { ok: /\d/.test(password), label: t("passwordReset.update.ruleNumber") },
    { ok: /[^A-Za-z0-9]/.test(password), label: t("passwordReset.update.ruleSymbol") },
  ];
  const policyOk = rules.every((r) => r.ok);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setNotice(t("passwordReset.update.minLength"));
      return;
    }
    if (!policyOk) {
      setNotice(t("passwordReset.update.policyNotice"));
      return;
    }
    if (password !== confirm) {
      setNotice(t("passwordReset.update.mismatch"));
      return;
    }
    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setNotice(t("passwordReset.update.error"));
      return;
    }
    setPhase("done");
  };

  return (
    <CustomerPageLayout>
    <main className="grid place-items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-sm space-y-4">
        {phase === "checking" && (
          <p className="text-center text-sm text-muted-foreground">
            {t("passwordReset.update.checking")}
          </p>
        )}
        {phase === "invalid" && (
          <div className="space-y-3 text-center">
            <h1 className="text-lg font-semibold">
              {t("passwordReset.update.invalidTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("passwordReset.update.invalidBody")}
            </p>
            <Button className="w-full" asChild>
              <Link to="/reset-password">
                {t("passwordReset.update.requestNew")}
              </Link>
            </Button>
          </div>
        )}
        {phase === "done" && (
          <div className="space-y-3 text-center">
            <h1 className="text-lg font-semibold">
              {t("passwordReset.update.successTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("passwordReset.update.successBody")}
            </p>
            <Button
              className="w-full"
              onClick={() => navigate("/account", { replace: true })}
            >
              {t("passwordReset.update.goToSignIn")}
            </Button>
          </div>
        )}
        {phase === "ready" && (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">
              {t("passwordReset.update.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("passwordReset.update.subtitle")}
            </p>
            <form className="space-y-3" onSubmit={submit}>
              <label className="block text-sm">
                {t("passwordReset.update.newPasswordLabel")}
                <PasswordInput
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <ul className="space-y-1 text-xs" aria-label={t("passwordReset.update.rulesTitle")}>
                <li className="text-muted-foreground">{t("passwordReset.update.rulesTitle")}</li>
                {rules.map((r) => (
                  <li
                    key={r.label}
                    className={
                      r.ok
                        ? "flex items-center gap-1.5 font-medium text-primary"
                        : "flex items-center gap-1.5 text-muted-foreground"
                    }
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    {r.label}
                  </li>
                ))}
              </ul>
              <label className="block text-sm">
                {t("passwordReset.update.confirmPasswordLabel")}
                <PasswordInput
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <Button disabled={busy} type="submit" className="w-full">
                {busy
                  ? t("passwordReset.update.saving")
                  : t("passwordReset.update.saveButton")}
              </Button>
            </form>
            {notice && (
              <p role="alert" className="text-sm text-destructive">
                {notice}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
    </CustomerPageLayout>
  );
};

export default UpdatePassword;
