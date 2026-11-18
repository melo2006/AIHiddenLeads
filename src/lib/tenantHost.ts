// Reseller subdomain resolution (design 2026-11-18 §12.2).
//
// The web container serves ONE SPA build for every host. When the app
// loads on <slug>.aihiddenleads.com, the slug names a reseller org and
// the public site renders under his brand; on the apex, www, stage or
// any other host there is no tenant and the platform site renders
// exactly as before. Resolution is purely client-side, after React
// mounts — the static no-JS HTML never carries tenant data (repo
// AGENTS.md rule).
//
// The slug rules (format, length, reserved words) are the shared
// tenancy helpers, so the browser and the voice-agents function agree
// on what a valid slug is. A slug that parses but names no active
// reseller is NOT decided here — the tenantBranding lookup answers
// null and the platform site renders (never an error page).

import {
  normalizeSubdomain,
  isReservedSubdomain,
  SUBDOMAIN_PATTERN,
  SUBDOMAIN_MIN_LENGTH,
  SUBDOMAIN_MAX_LENGTH,
} from "@/lib/tenancy";

const TENANT_HOST_SUFFIX = ".aihiddenleads.com";

/** The tenant slug for a hostname, or null when the host is not a
 *  tenant host: the apex, www, stage, voice-proxy, localhost, any
 *  other domain, a multi-label host, or a malformed/reserved label. */
export function parseTenantSlug(hostname: string | null | undefined): string | null {
  if (!hostname) return null;
  const host = hostname.trim().toLowerCase().split(":")[0];
  if (!host.endsWith(TENANT_HOST_SUFFIX)) return null;
  const label = host.slice(0, -TENANT_HOST_SUFFIX.length);
  if (!label || label.includes(".")) return null;
  const slug = normalizeSubdomain(label);
  if (!slug || isReservedSubdomain(slug)) return null;
  if (slug.length < SUBDOMAIN_MIN_LENGTH || slug.length > SUBDOMAIN_MAX_LENGTH) return null;
  if (!SUBDOMAIN_PATTERN.test(slug)) return null;
  return slug;
}
