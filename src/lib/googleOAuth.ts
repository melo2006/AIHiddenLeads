import { supabase } from "@/integrations/supabase/client";

export const OAUTH_MESSAGE_TYPE = "SUPABASE_OAUTH_SUCCESS";
export const OAUTH_CODE_MESSAGE_TYPE = "SUPABASE_OAUTH_CODE";
export const OAUTH_CHANNEL_NAME = "ihl_supabase_oauth_channel";

export type OAuthPopupMessage =
  | {
      type: typeof OAUTH_MESSAGE_TYPE;
      access_token: string;
      refresh_token: string;
    }
  | {
      type: typeof OAUTH_CODE_MESSAGE_TYPE;
      code: string;
    };

export function isEmbeddedIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Initiates Google OAuth.
 * Inside an iframe (such as the AI Studio preview environment), navigating the
 * iframe directly to accounts.google.com fails with 403 / X-Frame-Options: DENY.
 * Instead, we open a top-level popup window directly to the OAuth provider URL
 * and receive the resulting PKCE code or session back via postMessage / BroadcastChannel.
 */
export async function startGoogleOAuth(options?: {
  returnPath?: string;
}): Promise<{ error: Error | null }> {
  if (typeof window === "undefined") {
    return { error: new Error("Browser environment required") };
  }

  if (options?.returnPath) {
    try {
      sessionStorage.setItem("customer-auth-return", options.returnPath);
    } catch {
      // Ignore storage restrictions
    }
  }

  const redirectTo = `${window.location.origin}/auth/callback`;
  const inIframe = isEmbeddedIframe();

  if (!inIframe) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
      },
    });
    return { error: error ?? null };
  }

  // Open a popup synchronously on user click to avoid popup blockers
  const popup = window.open(
    "about:blank",
    "ihl_google_oauth",
    "width=540,height=680,menubar=no,toolbar=no,location=yes,status=no"
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data?.url) {
    if (popup && !popup.closed) popup.close();
    return { error: error ?? new Error("Could not generate Google sign-in URL.") };
  }

  if (popup && !popup.closed) {
    popup.location.href = data.url;
    popup.focus();
    return { error: null };
  }

  // Fallback if popup was blocked
  const fallbackPopup = window.open(data.url, "_blank");
  if (!fallbackPopup) {
    return {
      error: new Error(
        "Popup blocked by browser. Please allow popups for this site or sign in with your email and password below."
      ),
    };
  }

  return { error: null };
}

/**
 * Listens for OAuth PKCE code or session tokens sent from the AuthCallback popup window
 * and applies them to the current iframe's Supabase client (where the PKCE code_verifier lives).
 */
export function listenForOAuthPopupSession(onAuthenticated?: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let handled = false;

  const applyMessage = async (payload: unknown) => {
    if (handled || !payload || typeof payload !== "object") return;
    const msg = payload as Partial<OAuthPopupMessage>;

    if (msg.type === OAUTH_CODE_MESSAGE_TYPE && typeof msg.code === "string" && msg.code) {
      handled = true;
      const { error } = await supabase.auth.exchangeCodeForSession(msg.code);
      if (!error) {
        onAuthenticated?.();
      } else {
        handled = false;
      }
      return;
    }

    if (
      msg.type === OAUTH_MESSAGE_TYPE &&
      typeof msg.access_token === "string" &&
      typeof msg.refresh_token === "string"
    ) {
      handled = true;
      const { error } = await supabase.auth.setSession({
        access_token: msg.access_token,
        refresh_token: msg.refresh_token,
      });
      if (!error) {
        onAuthenticated?.();
      } else {
        handled = false;
      }
    }
  };

  const handleMessage = (event: MessageEvent) => {
    const origin = event.origin || "";
    if (
      origin !== window.location.origin &&
      !origin.endsWith(".run.app") &&
      !origin.includes("localhost")
    ) {
      return;
    }
    void applyMessage(event.data);
  };

  window.addEventListener("message", handleMessage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(OAUTH_CHANNEL_NAME);
      channel.onmessage = (event) => {
        void applyMessage(event.data);
      };
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener("message", handleMessage);
    if (channel) {
      try {
        channel.close();
      } catch {
        // Ignore
      }
    }
  };
}
