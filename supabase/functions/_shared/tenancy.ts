// Tenancy — pure logic for the multi-tenant / reseller platform
// (design 2026-11-18, Phase 2). Everything in this module is pure and
// I/O-free so the edge functions (voice-agents, gemini-session) and the
// browser (via src/lib/tenancy.ts re-export) share ONE implementation
// of the role ladder, subtree scoping, per-tenant limits and cap
// evaluation. Server code resolves the caller's scope from real
// membership rows and passes plain data in here; nothing in this file
// trusts the client.
//
// White-label rule: no vendor names anywhere in this module's strings.

/** Membership roles, weakest to strongest (design §2). 'editor' is the
 *  only role that existed before Phase 2 and stays valid forever. */
export const MEMBERSHIP_ROLES = ['viewer', 'editor', 'admin', 'owner'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

const ROLE_RANK: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function isMembershipRole(v: unknown): v is MembershipRole {
  return typeof v === 'string' && v in ROLE_RANK;
}

/** The strongest role in a list, or null when none are valid roles. */
export function strongestRole(roles: readonly unknown[]): MembershipRole | null {
  let best: MembershipRole | null = null;
  for (const r of roles) {
    if (isMembershipRole(r) && (best === null || ROLE_RANK[r] > ROLE_RANK[best])) best = r;
  }
  return best;
}

/** True when `actual` is at least as strong as `required`. */
export function roleSatisfies(actual: unknown, required: MembershipRole): boolean {
  return isMembershipRole(actual) && ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** Roles that may work on an org's assistants (read + write). */
export const WORK_ROLES: MembershipRole[] = ['editor', 'admin', 'owner'];
/** Roles that may manage an org (branding, team, invites, limits). */
export const MANAGE_ROLES: MembershipRole[] = ['admin', 'owner'];

// ---------------------------------------------------------------------------
// Subtree scope
// ---------------------------------------------------------------------------

export interface OrgLite {
  id: string;
  parentOrganizationId?: string | null;
  type?: string | null;
  status?: string | null;
}

/**
 * The set of organization ids in `rootId`'s subtree: the root itself
 * plus every descendant (children, grandchildren, ...). One reseller
 * level is the product rule in v1, but the walk is depth-safe so the
 * data can never hide an org from its own root by nesting.
 */
export function subtreeOrgIds(orgs: readonly OrgLite[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const o of orgs) {
    if (o.parentOrganizationId) {
      const list = childrenByParent.get(o.parentOrganizationId) ?? [];
      list.push(o.id);
      childrenByParent.set(o.parentOrganizationId, list);
    }
  }
  const out = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of childrenByParent.get(cur) ?? []) {
      if (!out.has(child)) { out.add(child); queue.push(child); }
    }
  }
  return out;
}

/** Direct children of an org (its client orgs, for a reseller). */
export function childOrgIds(orgs: readonly OrgLite[], parentId: string): string[] {
  return orgs.filter((o) => o.parentOrganizationId === parentId).map((o) => o.id);
}

export type CallerScope =
  | { kind: 'platform' }
  | { kind: 'tenant'; rootOrgId: string; orgIds: Set<string>; role: MembershipRole }
  | { kind: 'none' };

/** Can this scope touch `orgId` at all? Platform touches everything;
 *  a tenant scope touches only its own subtree; none touches nothing. */
export function scopeIncludes(scope: CallerScope, orgId: string | null | undefined): boolean {
  if (!orgId) return false;
  if (scope.kind === 'platform') return true;
  if (scope.kind === 'tenant') return scope.orgIds.has(orgId);
  return false;
}

/** Can this scope MANAGE `orgId` (branding, team, invites)? Platform
 *  always; a tenant scope only on its own root org, and only with a
 *  manage-level role. Client orgs inside the subtree are workable by
 *  the reseller's staff but their branding/team belong to the client. */
export function scopeCanManageOrg(scope: CallerScope, orgId: string | null | undefined): boolean {
  if (!orgId) return false;
  if (scope.kind === 'platform') return true;
  if (scope.kind === 'tenant') return scope.rootOrgId === orgId && roleSatisfies(scope.role, 'admin');
  return false;
}

// ---------------------------------------------------------------------------
// Per-tenant limits (design §6) — stored in voice_organizations.feature_limits
// ---------------------------------------------------------------------------

export const FEATURE_KEYS = [
  'voiceAgents', 'videoAvatar', 'voiceCloning', 'phoneNumbers', 'sms', 'emailSending', 'leadGen',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface TenantLimits {
  /** Max client orgs under this tenant (resellers). Null = unlimited. */
  maxClients: number | null;
  /** Voice minutes per month across the whole subtree. Null = unlimited. */
  minutesPool: number | null;
  /** Demo spend per month in USD. Null = unlimited. */
  demoBudgetUsd: number | null;
  /** Overall metered spend per month in USD — the master fuse. Null = unlimited. */
  monthlySpendCapUsd: number | null;
  /** Feature toggles; an absent key means ON (today's behavior). */
  features: Partial<Record<FeatureKey, boolean>>;
}

export const EMPTY_LIMITS: TenantLimits = {
  maxClients: null, minutesPool: null, demoBudgetUsd: null, monthlySpendCapUsd: null, features: {},
};

const posNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const posInt = (v: unknown): number | null => {
  const n = posNum(v);
  return n === null ? null : Math.floor(n);
};

/** Normalize an unknown feature_limits payload. Never throws; unknown
 *  keys are dropped, bad numbers become null (unlimited), and only
 *  explicit `false` turns a feature off. */
export function normalizeLimits(raw: unknown): TenantLimits {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_LIMITS, features: {} };
  const r = raw as Record<string, unknown>;
  const features: Partial<Record<FeatureKey, boolean>> = {};
  const rawFeatures = r.features && typeof r.features === 'object' ? (r.features as Record<string, unknown>) : {};
  for (const key of FEATURE_KEYS) {
    if (typeof rawFeatures[key] === 'boolean') features[key] = rawFeatures[key] as boolean;
  }
  return {
    maxClients: posInt(r.maxClients),
    minutesPool: posNum(r.minutesPool),
    demoBudgetUsd: posNum(r.demoBudgetUsd),
    monthlySpendCapUsd: posNum(r.monthlySpendCapUsd),
    features,
  };
}

/** Validate an admin-submitted limits payload for writing. Returns the
 *  normalized limits, or an error string. Stricter than normalizeLimits:
 *  a write with a negative or non-numeric cap is rejected, not nulled. */
export function validateLimitsInput(raw: unknown): { limits: TenantLimits } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Limits are required' };
  const r = raw as Record<string, unknown>;
  for (const key of ['maxClients', 'minutesPool', 'demoBudgetUsd', 'monthlySpendCapUsd'] as const) {
    const v = r[key];
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
      return { error: `${key} must be a non-negative number or empty` };
    }
  }
  if (r.features !== undefined) {
    if (!r.features || typeof r.features !== 'object') return { error: 'features must be an object' };
    for (const [k, v] of Object.entries(r.features as Record<string, unknown>)) {
      if (!(FEATURE_KEYS as readonly string[]).includes(k)) return { error: `Unknown feature: ${k}` };
      if (typeof v !== 'boolean') return { error: `Feature ${k} must be on or off` };
    }
  }
  return { limits: normalizeLimits(raw) };
}

export function featureEnabled(limits: TenantLimits, key: FeatureKey): boolean {
  return limits.features[key] !== false;
}

// ---------------------------------------------------------------------------
// Cap evaluation (design §6 + §8 decision 4: warn at 80%, hard stop at 100%)
// ---------------------------------------------------------------------------

export type CapState = 'ok' | 'warning' | 'blocked' | 'unlimited';

export function capState(used: number, cap: number | null): CapState {
  if (cap === null) return 'unlimited';
  if (cap <= 0) return used > 0 ? 'blocked' : 'warning';
  const ratio = used / cap;
  if (ratio >= 1) return 'blocked';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

export interface UsageTotals {
  /** Voice + avatar minutes this month across the subtree. */
  minutes: number;
  /** All metered spend this month in USD (platform cost basis). */
  spendUsd: number;
  /** Demo-classified spend this month in USD. */
  demoSpendUsd: number;
  /** Client orgs currently under the tenant. */
  clientCount: number;
}

export interface CapEvaluation {
  minutes: CapState;
  spend: CapState;
  demoSpend: CapState;
  clients: CapState;
  /** Any cap at its hard stop. */
  blocked: boolean;
  /** The first blocked cap's key, for messages/logging. */
  blockedBy: 'minutes' | 'spend' | 'demoSpend' | 'clients' | null;
}

export function evaluateCaps(limits: TenantLimits, usage: UsageTotals): CapEvaluation {
  const minutes = capState(usage.minutes, limits.minutesPool);
  const spend = capState(usage.spendUsd, limits.monthlySpendCapUsd);
  const demoSpend = capState(usage.demoSpendUsd, limits.demoBudgetUsd);
  const clients = capState(usage.clientCount, limits.maxClients);
  const blockedBy = minutes === 'blocked' ? 'minutes'
    : spend === 'blocked' ? 'spend'
    : demoSpend === 'blocked' ? 'demoSpend'
    : clients === 'blocked' ? 'clients'
    : null;
  return { minutes, spend, demoSpend, clients, blocked: blockedBy !== null, blockedBy };
}

/**
 * Decide whether a NEW session may start for an org governed by
 * `limits`. Demo-classified sessions answer to the demo budget as well
 * as the shared pools; ordinary sessions answer to minutes + spend.
 * Suspension is handled by the caller (org status), not here.
 */
export function sessionGate(
  limits: TenantLimits,
  usage: UsageTotals,
  opts: { demo: boolean },
): { allowed: true } | { allowed: false; blockedBy: NonNullable<CapEvaluation['blockedBy']> } {
  const caps = evaluateCaps(limits, usage);
  if (caps.minutes === 'blocked') return { allowed: false, blockedBy: 'minutes' };
  if (caps.spend === 'blocked') return { allowed: false, blockedBy: 'spend' };
  if (opts.demo && caps.demoSpend === 'blocked') return { allowed: false, blockedBy: 'demoSpend' };
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Invites (design §3/§4)
// ---------------------------------------------------------------------------

export const INVITE_KINDS = ['reseller', 'client', 'staff'] as const;
export type InviteKind = (typeof INVITE_KINDS)[number];

export const INVITE_EXPIRY_MS = 7 * 86400000;

/** The membership role an accepted invite grants, by kind. A reseller
 *  invite makes the invitee OWNER of the new reseller org; a client
 *  invite makes them OWNER of their client org; a staff invite grants
 *  whatever role the inviter chose (never owner). */
export function inviteGrantRole(kind: InviteKind, chosenRole?: unknown): MembershipRole {
  if (kind === 'reseller' || kind === 'client') return 'owner';
  return isMembershipRole(chosenRole) && chosenRole !== 'owner' ? chosenRole : 'editor';
}

export function inviteStatusAt(
  invite: { status?: string | null; expires_at?: string | null },
  now: number = Date.now(),
): 'pending' | 'accepted' | 'expired' | 'revoked' | 'unknown' {
  const s = invite.status;
  if (s === 'accepted' || s === 'revoked') return s;
  if (s === 'pending') {
    const exp = invite.expires_at ? Date.parse(invite.expires_at) : NaN;
    if (Number.isFinite(exp) && exp <= now) return 'expired';
    return 'pending';
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Branding (design §4.1)
// ---------------------------------------------------------------------------

export const SLOGAN_MAX = 80;

/** Small preset palette for brand colors (design §3: "a small preset
 *  palette"). Free-form hex is also accepted when it parses. */
export const BRAND_COLOR_PRESETS = [
  '#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899',
  '#f59e0b', '#ef4444', '#14b8a6', '#334155', '#0f172a',
] as const;

const cleanStr = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export interface BrandingInput {
  name: string | null;
  slogan: string | null;
  supportEmail: string | null;
  brandColor: string | null;
  logoUrl: string | null;
}

/** Validate a branding save. Returns cleaned values or an error. */
export function validateBrandingInput(raw: unknown): { branding: BrandingInput } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Branding details are required' };
  const r = raw as Record<string, unknown>;
  const slogan = cleanStr(r.slogan, 1000);
  if (slogan && slogan.length > SLOGAN_MAX) return { error: `Slogan must be ${SLOGAN_MAX} characters or fewer` };
  const supportEmail = cleanStr(r.supportEmail, 200);
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) return { error: 'Support email looks invalid' };
  const brandColor = cleanStr(r.brandColor, 20);
  if (brandColor && !/^#[0-9a-f]{6}$/i.test(brandColor)) return { error: 'Brand color must be a hex color like #10b981' };
  const logoUrl = cleanStr(r.logoUrl, 2000);
  if (logoUrl && !/^https:\/\//.test(logoUrl) && !logoUrl.startsWith('data:image/')) {
    return { error: 'Logo must be an uploaded image' };
  }
  return {
    branding: {
      name: cleanStr(r.name, 160),
      slogan,
      supportEmail,
      brandColor: brandColor ? brandColor.toLowerCase() : null,
      logoUrl,
    },
  };
}

/** Initials for a generated placeholder mark: first letters of the
 *  first two words, uppercased. */
export function initialsFor(name: string | null | undefined): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * A clean generated placeholder logo (design §4.1 "Generate one for
 * me"): rounded square in the brand color with the company's initials.
 * Returned as an SVG string; the client uploads it to the branding
 * bucket exactly like a real logo, so there is one logo code path.
 */
export function placeholderLogoSvg(name: string | null | undefined, brandColor: string | null | undefined): string {
  const color = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : '#10b981';
  const initials = initialsFor(name).replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="28" fill="${color}"/><text x="72" y="90" font-size="52" font-weight="700" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif">${initials}</text></svg>`;
}

/** Branding is "set up" once a logo exists (the Phase 1 rule: the logo
 *  is the one unambiguous branding act). Until then a reseller's
 *  clients cannot be invited (design §4.1). */
export function brandingComplete(branding: { logoUrl?: string | null } | null | undefined): boolean {
  return Boolean(branding?.logoUrl);
}

// ---------------------------------------------------------------------------
// Reseller subdomains (design §12.2 — company.aihiddenleads.com)
// ---------------------------------------------------------------------------

/** Hosts that are the platform itself or infrastructure — never a
 *  tenant slug. 'aihiddenleads' is the apex label itself. */
export const RESERVED_SUBDOMAINS = [
  'www', 'stage', 'voice-proxy', 'app', 'api', 'mail', 'demo',
  'admin', 'support', 'aihiddenleads',
] as const;

export const SUBDOMAIN_MIN_LENGTH = 3;
export const SUBDOMAIN_MAX_LENGTH = 40;

/** The slug shape: lowercase letters/digits with single hyphens
 *  between segments — the same style as the agent-slug rule. */
export const SUBDOMAIN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Canonicalize a raw subdomain value for storage/lookup: trimmed
 *  and lowercased. Returns null for non-strings and empties. */
export function normalizeSubdomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v ? v : null;
}

export function isReservedSubdomain(slug: string): boolean {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(slug);
}

/** Validate a subdomain for ASSIGNMENT (setSubdomain). Returns the
 *  canonical slug or an error. Lookup paths (tenantBranding) use
 *  normalizeSubdomain + isReservedSubdomain only — a malformed or
 *  reserved lookup slug simply resolves to no tenant. */
export function validateSubdomain(raw: unknown): { subdomain: string } | { error: string } {
  const slug = normalizeSubdomain(raw);
  if (!slug) return { error: 'Subdomain is required' };
  if (slug.length < SUBDOMAIN_MIN_LENGTH) return { error: `Subdomain must be at least ${SUBDOMAIN_MIN_LENGTH} characters` };
  if (slug.length > SUBDOMAIN_MAX_LENGTH) return { error: `Subdomain must be ${SUBDOMAIN_MAX_LENGTH} characters or fewer` };
  if (!SUBDOMAIN_PATTERN.test(slug)) return { error: 'Subdomain may use lowercase letters, numbers and single hyphens only' };
  if (isReservedSubdomain(slug)) return { error: 'That subdomain is reserved' };
  return { subdomain: slug };
}
