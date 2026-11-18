// Clients — data shaping for the platform admin's Clients view and for
// tenant branding (multi-tenant / reseller design, Phase 1, 2026-11-18).
//
// A paying customer is scattered across four records — an auth user, a
// `subscriptions` row, a `customer_workspaces` row and a `voice_agents`
// row. The voice-agents function's admin-only `clients` action joins
// them server-side (the browser never queries auth users directly) and
// returns one flat payload per customer; this module turns that payload
// into display rows. All shaping lives here so it is unit-testable
// without a backend.
//
// Branding: an organization may carry branding (logo, slogan, support
// email, brand color — the Phase 1 columns on voice_organizations). The
// customer-facing shell resolves it through resolveBrand(); until an org
// actually sets a logo, every customer sees the platform AiHiddenLeads
// brand exactly as before Phase 1.

/** One row of the voice-agents `clients` action payload. Every field
 *  may be null in the wild (missing subscription, deleted auth user,
 *  branding columns not yet applied) — shaping must never throw. */
export interface ClientPayload {
  userId: string;
  email?: string | null;
  customerName?: string | null;
  organizationId: string;
  businessName?: string | null;
  organizationType?: string | null;
  organizationStatus?: string | null;
  parentOrganizationId?: string | null;
  parentOrganizationName?: string | null;
  agentId?: string | null;
  environment?: string | null;
  planPriceId?: string | null;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
  joinedAt?: string | null;
  linkedProspectId?: string | null;
  /** Phase 2.5: this customer belongs to a seeded demo org —
   *  presentation data, never a real (or billed) customer. */
  isDemo?: boolean | null;
}

export interface ClientViewModel {
  userId: string;
  organizationId: string;
  /** Person name when the auth profile has one, else their email. */
  customerName: string;
  email: string | null;
  businessName: string;
  agentId: string | null;
  environment: string | null;
  planPriceId: string | null;
  planLabel: string;
  subscriptionStatus: string | null;
  /** What the Status column shows: the subscription status, or an
   *  honest "No subscription" when the join found none. */
  statusLabel: string;
  currentPeriodEnd: string | null;
  /** "Direct" for Ron's own customers; the reseller's name once the
   *  Phase 2 hierarchy puts clients under a parent org. */
  tenantLabel: string;
  parentOrganizationId: string | null;
  organizationStatus: string;
  joinedAt: string | null;
  linkedProspectId: string | null;
  /** Seeded presentation account (Phase 2.5 demo world). */
  isDemo: boolean;
}

/** Plan display names — the same names/prices the customer sees in
 *  their own dashboard plan picker (CustomerSetup). */
export const PLAN_LABELS: Record<string, string> = {
  essentials_monthly: "Premium · $99/mo",
  growth_monthly: "Pro · $199/mo",
  fullservice_monthly: "Platinum · $349/mo",
  video_avatar_monthly: "Video avatar add-on · $79/mo",
};

export function planLabel(priceId: string | null | undefined): string {
  if (!priceId) return "No plan";
  return PLAN_LABELS[priceId] ?? priceId;
}

export function shapeClientRow(p: ClientPayload): ClientViewModel {
  const email = p.email?.trim() ? p.email.trim() : null;
  const name = p.customerName?.trim() ? p.customerName.trim() : null;
  return {
    userId: p.userId,
    organizationId: p.organizationId,
    customerName: name ?? email ?? "Unknown customer",
    email,
    businessName: p.businessName?.trim() ? p.businessName.trim() : "Unknown business",
    agentId: p.agentId ?? null,
    environment: p.environment ?? null,
    planPriceId: p.planPriceId ?? null,
    planLabel: planLabel(p.planPriceId),
    subscriptionStatus: p.subscriptionStatus ?? null,
    statusLabel: p.subscriptionStatus ?? "No subscription",
    currentPeriodEnd: p.currentPeriodEnd ?? null,
    tenantLabel: p.parentOrganizationName?.trim() ? p.parentOrganizationName.trim() : "Direct",
    parentOrganizationId: p.parentOrganizationId ?? null,
    organizationStatus: p.organizationStatus ?? "active",
    joinedAt: p.joinedAt ?? null,
    linkedProspectId: p.linkedProspectId ?? null,
    isDemo: p.isDemo === true,
  };
}

export function shapeClients(payload: ClientPayload[] | null | undefined): ClientViewModel[] {
  if (!Array.isArray(payload)) return [];
  return payload.map(shapeClientRow);
}

/** The slice of a prospect the lead -> customer link works with. */
export interface ProspectLite {
  id: string;
  business_name: string;
  email?: string | null;
  owner_email?: string | null;
  converted_organization_id?: string | null;
}

const normalizeEmail = (v: string | null | undefined) => (v ? v.trim().toLowerCase() : "");

/**
 * Suggest the prospect a customer most likely converted from: the
 * unlinked prospect whose contact email or owner email matches the
 * customer's account email (case-insensitive). A suggestion only —
 * nothing is written until the admin confirms the link in the UI.
 */
export function suggestProspectMatch(
  customerEmail: string | null | undefined,
  prospects: ProspectLite[] | null | undefined,
): ProspectLite | null {
  const target = normalizeEmail(customerEmail);
  if (!target || !Array.isArray(prospects)) return null;
  for (const p of prospects) {
    if (p.converted_organization_id) continue; // already linked to a customer
    if (normalizeEmail(p.email) === target || normalizeEmail(p.owner_email) === target) return p;
  }
  return null;
}

/** Organization branding as returned by the voice-agents `myBranding`
 *  action (camelCase mirror of the voice_organizations columns). */
export interface OrgBranding {
  name: string | null;
  logoUrl: string | null;
  slogan: string | null;
  supportEmail: string | null;
  brandColor: string | null;
}

const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Normalize an unknown payload into OrgBranding, or null when there is
 *  no usable branding at all (no org, pre-SQL row, empty payload). */
export function normalizeBranding(raw: unknown): OrgBranding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const branding: OrgBranding = {
    name: clean(r.name),
    logoUrl: clean(r.logoUrl),
    slogan: clean(r.slogan),
    supportEmail: clean(r.supportEmail),
    brandColor: clean(r.brandColor),
  };
  if (!branding.name && !branding.logoUrl && !branding.slogan && !branding.supportEmail && !branding.brandColor) return null;
  return branding;
}

export type ResolvedBrand =
  | { source: "platform" }
  | { source: "org"; name: string; logoUrl: string | null; brandColor?: string | null };

/**
 * Decide what the customer-facing header shows.
 *
 * Phase 1 rule (deliberate): an org's brand takes over the header only
 * once the org has set a logo — the one unambiguous branding act.
 * Name-only orgs (which is every pre-Phase-1 customer: their org name
 * is their business name, set at provisioning) keep the platform
 * AiHiddenLeads lockup, so nobody's header changes under them until
 * branding is actually configured.
 */
export function resolveBrand(branding: OrgBranding | null | undefined): ResolvedBrand {
  if (branding?.logoUrl) {
    return { source: "org", name: branding.name ?? "AI Hidden Leads", logoUrl: branding.logoUrl };
  }
  return { source: "platform" };
}

/**
 * Brand resolution for a claimed reseller SUBDOMAIN (design §12.2).
 * Deliberately different from resolveBrand's logo gate: claiming the
 * subdomain is itself the branding act — the reseller deliberately
 * pointed his public host at the platform — so a name-only lockup
 * (company name in his brand color) takes over the public site even
 * before a logo exists. A logo, when present, renders beside the name
 * exactly as in the customer shell.
 */
export function resolveTenantBrand(branding: OrgBranding | null | undefined): ResolvedBrand {
  const name = branding?.name?.trim();
  if (name) {
    return { source: "org", name, logoUrl: branding.logoUrl, brandColor: branding.brandColor };
  }
  return { source: "platform" };
}
