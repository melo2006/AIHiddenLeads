import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeBranding, type OrgBranding } from "@/lib/clients";
import { parseTenantSlug } from "@/lib/tenantHost";

// Tenant brand for a reseller subdomain (design 2026-11-18 §12.2).
//
// When the SPA loads on <slug>.aihiddenleads.com, the provider asks
// the voice-agents function's public `tenantBranding` action whose
// brand this host is. The answer is public brand data only (company
// name, logo, slogan, support email, brand color) — the function
// returns nothing else pre-auth. Unknown/unclaimed slugs, the apex,
// www and stage all resolve to null and the site renders the platform
// brand, byte-for-byte as before. Any fetch failure also degrades to
// null: a branding hiccup must never break the public site.

export interface TenantHostBrand {
  slug: string;
  branding: OrgBranding;
}

const TenantBrandContext = createContext<TenantHostBrand | null>(null);

let cachedFor: string | null = null;
let cachedPromise: Promise<TenantHostBrand | null> | null = null;

function fetchTenantBrand(slug: string): Promise<TenantHostBrand | null> {
  if (cachedPromise && cachedFor === slug) return cachedPromise;
  cachedFor = slug;
  cachedPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("voice-agents", {
        body: { action: "tenantBranding", subdomain: slug },
      });
      if (error) return null;
      const branding = normalizeBranding((data as { branding?: unknown } | null)?.branding);
      return branding?.name ? { slug, branding } : null;
    } catch {
      return null;
    }
  })();
  return cachedPromise;
}

export function TenantBrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<TenantHostBrand | null>(null);

  useEffect(() => {
    const slug = parseTenantSlug(window.location.hostname);
    if (!slug) return;
    let active = true;
    void fetchTenantBrand(slug).then((next) => {
      if (active) setBrand(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return <TenantBrandContext.Provider value={brand}>{children}</TenantBrandContext.Provider>;
}

/** The tenant brand for this host, or null on platform hosts. */
export function useTenantBrand(): TenantHostBrand | null {
  return useContext(TenantBrandContext);
}
