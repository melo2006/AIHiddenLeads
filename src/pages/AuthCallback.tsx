import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { safeReturnPath } from "@/lib/authReturn";
import {
  OAUTH_CHANNEL_NAME,
  OAUTH_CODE_MESSAGE_TYPE,
  OAUTH_MESSAGE_TYPE,
  type OAuthPopupMessage,
} from "@/lib/googleOAuth";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing sign-in...");
  const [backPath, setBackPath] = useState("/dashboard");

  useEffect(() => {
    let active = true;
    const searchParams = new URLSearchParams(window.location.search);
    const destination =
      searchParams.get("next") || sessionStorage.getItem("customer-auth-return");
    const returnPath = safeReturnPath(destination) || "/dashboard/calls";

    const isCustomer = returnPath !== "/dashboard/calls";
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const providerError =
      hash.get("error_description") || searchParams.get("error_description");
    if (providerError) {
      setMessage(
        `Sign-in did not finish: ${providerError.replace(/\+/g, " ")}. Please go back and try again.`
      );
    }
    setBackPath(isCustomer ? returnPath : "/dashboard");

    const postToOpener = (payload: OAuthPopupMessage): boolean => {
      if (typeof BroadcastChannel !== "undefined") {
        try {
          const ch = new BroadcastChannel(OAUTH_CHANNEL_NAME);
          ch.postMessage(payload);
          ch.close();
        } catch {
          // Ignore BroadcastChannel errors
        }
      }
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage(payload, "*");
          window.close();
          return true;
        } catch {
          // Fall through
        }
      }
      return false;
    };

    // If opened as an OAuth popup with a PKCE ?code=..., hand the code back to the opener
    // iframe immediately so the iframe exchanges it using its own partitioned localStorage verifier.
    const code = searchParams.get("code");
    if (code && window.opener && window.opener !== window) {
      if (postToOpener({ type: OAUTH_CODE_MESSAGE_TYPE, code })) {
        return;
      }
    }

    const finishWithSession = (accessToken: string, refreshToken: string) => {
      if (
        postToOpener({
          type: OAUTH_MESSAGE_TYPE,
          access_token: accessToken,
          refresh_token: refreshToken,
        })
      ) {
        return;
      }
      if (active) {
        navigate(returnPath, { replace: true });
      }
    };

    const openDashboard = async () => {
      if (code) {
        const { data: codeData, error: codeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (!codeError && codeData.session) {
          finishWithSession(
            codeData.session.access_token,
            codeData.session.refresh_token
          );
          return;
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error) {
        setMessage("We could not complete sign-in. Please go back and try again.");
        return;
      }

      if (data.session) {
        finishWithSession(data.session.access_token, data.session.refresh_token);
        return;
      }

      setMessage("Waiting for sign-in to finish...");
    };

    void openDashboard();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        finishWithSession(session.access_token, session.refresh_token);
      }
    });

    const timeout = window.setTimeout(() => {
      if (active) setMessage("Sign-in did not finish. Please go back and try again.");
    }, 12000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <main className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <img src="/logo.png" alt="AI Hidden Leads" className="mx-auto h-12 w-12" />
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate(backPath, { replace: true })}
        >
          {backPath === "/dashboard" ? "Return to admin login" : "Back to checkout"}
        </Button>
      </div>
    </main>
  );
};

export default AuthCallback;