import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeBranding, type OrgBranding } from "@/lib/clients";

// Tenant branding for the customer-facing shell (multi-tenant design
// Phase 1, 2026-11-18). The signed-in customer's own organization
// branding comes from the voice-agents function's `myBranding` action —
// the server resolves which org the user belongs to; the browser never
// guesses. Signed-out visitors and users whose org carries no branding
// get null, and the shell shows the platform AiHiddenLeads brand,
// exactly as before Phase 1. Fetched once per signed-in user; any
// failure degrades to null (platform brand), never an error surface.

const cache = new Map<string, OrgBranding | null>();

async function fetchBranding(userId: string): Promise<OrgBranding | null> {
  if (cache.has(userId)) return cache.get(userId) ?? null;
  let branding: OrgBranding | null = null;
  try {
    const { data, error } = await supabase.functions.invoke("voice-agents", { body: { action: "myBranding" } });
    if (!error) branding = normalizeBranding((data as { branding?: unknown } | null)?.branding);
  } catch {
    branding = null;
  }
  cache.set(userId, branding);
  return branding;
}

export function useOrgBranding(): OrgBranding | null {
  const [branding, setBranding] = useState<OrgBranding | null>(null);

  useEffect(() => {
    let active = true;
    const load = async (userId: string | null) => {
      if (!userId) {
        if (active) setBranding(null);
        return;
      }
      const next = await fetchBranding(userId);
      if (active) setBranding(next);
    };
    void supabase.auth.getUser().then(({ data }) => void load(data.user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return branding;
}
