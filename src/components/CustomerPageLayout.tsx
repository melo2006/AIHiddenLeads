import type { ReactNode } from 'react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import Footer from '@/components/landing/Footer';
import { useOrgBranding } from '@/lib/useOrgBranding';
import { resolveBrand } from '@/lib/clients';

/**
 * Customer-facing shell (/account, /setup, checkout, help). The header
 * wears the signed-in customer's organization brand once that org has
 * set a logo (multi-tenant design Phase 1); everyone else — signed-out
 * visitors and customers whose org has no branding yet — sees the
 * platform AiHiddenLeads brand, exactly as before Phase 1.
 */
export default function CustomerPageLayout({ children }: { children: ReactNode }) {
  const branding = useOrgBranding();
  const brand = resolveBrand(branding);
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><LandingNavbar brand={brand} /><div className="flex-1">{children}</div><Footer /></div>;
}
