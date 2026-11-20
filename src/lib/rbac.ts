// RBAC — client-side mirror of the platform permission matrix
// (design: rbac-admin-design.md §3; database seed:
// supabase/migrations/20261120120000_rbac_admin.sql).
//
// The DATABASE is the authority: has_permission() + the guarded
// assign_staff_role() / set_staff_active() RPCs decide what is really
// allowed, and the voice-agents edge function enforces it. This module
// exists so the Team page can render the matrix and pre-disable
// controls the server would reject anyway — and so the rules have one
// unit-testable home on the client. If this file and the SQL seed ever
// disagree, the SQL wins and this file is the bug.

export const RBAC_AREAS = [
  "clients",
  "resellers",
  "campaigns",
  "leads",
  "billing",
  "content",
  "settings",
  "team",
  "audit",
] as const;
export type RbacArea = (typeof RBAC_AREAS)[number];

export const RBAC_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "send",
  "change",
  "manage",
] as const;
export type RbacAction = (typeof RBAC_ACTIONS)[number];

/** The actions that exist per area (drives the matrix grid). */
export const AREA_ACTIONS: Record<RbacArea, RbacAction[]> = {
  clients: ["view", "create", "edit", "delete"],
  resellers: ["view", "create", "edit", "delete"],
  campaigns: ["view", "create", "edit", "send"],
  leads: ["view", "edit"],
  billing: ["view", "change"],
  content: ["view", "edit"],
  settings: ["view", "change"],
  team: ["view", "manage"],
  audit: ["view"],
};

export interface RbacRole {
  key: string;
  name: string;
  rank: number;
}

export const PLATFORM_ROLES: RbacRole[] = [
  { key: "owner", name: "Owner", rank: 100 },
  { key: "admin", name: "Admin", rank: 80 },
  { key: "operations_manager", name: "Operations Manager", rank: 60 },
  { key: "sales_assistant", name: "Sales Assistant", rank: 40 },
  { key: "support", name: "Support", rank: 20 },
  { key: "read_only", name: "Read-Only", rank: 10 },
];

const perm = (area: RbacArea, action: RbacAction) => `${area}:${action}`;

/** role key -> set of "area:action" grants. Transcribed from design §3
 *  exactly as seeded in role_permissions. */
export const ROLE_PERMISSIONS: Record<string, ReadonlySet<string>> = {
  owner: new Set([
    perm("clients", "view"), perm("clients", "create"), perm("clients", "edit"), perm("clients", "delete"),
    perm("resellers", "view"), perm("resellers", "create"), perm("resellers", "edit"), perm("resellers", "delete"),
    perm("campaigns", "view"), perm("campaigns", "create"), perm("campaigns", "edit"), perm("campaigns", "send"),
    perm("leads", "view"), perm("leads", "edit"),
    perm("billing", "view"), perm("billing", "change"),
    perm("content", "view"), perm("content", "edit"),
    perm("settings", "view"), perm("settings", "change"),
    perm("team", "view"), perm("team", "manage"),
    perm("audit", "view"),
  ]),
  admin: new Set([
    perm("clients", "view"), perm("clients", "create"), perm("clients", "edit"),
    perm("resellers", "view"), perm("resellers", "create"), perm("resellers", "edit"),
    perm("campaigns", "view"), perm("campaigns", "create"), perm("campaigns", "edit"), perm("campaigns", "send"),
    perm("leads", "view"), perm("leads", "edit"),
    perm("billing", "view"),
    perm("content", "view"), perm("content", "edit"),
    perm("settings", "view"), perm("settings", "change"),
    perm("team", "view"), perm("team", "manage"),
    perm("audit", "view"),
  ]),
  operations_manager: new Set([
    perm("clients", "view"), perm("clients", "create"), perm("clients", "edit"),
    perm("resellers", "view"),
    perm("campaigns", "view"), perm("campaigns", "create"), perm("campaigns", "edit"),
    perm("leads", "view"), perm("leads", "edit"),
    perm("billing", "view"),
    perm("content", "view"), perm("content", "edit"),
    perm("settings", "view"),
  ]),
  sales_assistant: new Set([
    perm("clients", "view"), perm("clients", "create"), perm("clients", "edit"),
    perm("campaigns", "view"), perm("campaigns", "create"), perm("campaigns", "edit"),
    perm("leads", "view"), perm("leads", "edit"),
  ]),
  support: new Set([
    perm("clients", "view"),
    perm("resellers", "view"),
    perm("campaigns", "view"),
    perm("leads", "view"),
    perm("content", "view"), perm("content", "edit"),
  ]),
  read_only: new Set([
    perm("clients", "view"),
    perm("resellers", "view"),
    perm("campaigns", "view"),
    perm("leads", "view"),
    perm("billing", "view"),
    perm("content", "view"),
    perm("settings", "view"),
  ]),
};

export function roleByKey(key: string | null | undefined): RbacRole | null {
  return PLATFORM_ROLES.find((r) => r.key === key) ?? null;
}

export function roleRank(key: string | null | undefined): number {
  return roleByKey(key)?.rank ?? -1;
}

/** Does this role hold the permission? (Matrix resolution only —
 *  scope and active-status checks live server-side.) */
export function can(roleKey: string | null | undefined, area: RbacArea, action: RbacAction): boolean {
  if (!roleKey) return false;
  return ROLE_PERMISSIONS[roleKey]?.has(perm(area, action)) ?? false;
}

/** Hierarchy guard: may `actorRole` assign `newRole` to someone else?
 *  Mirrors assign_staff_role() in the migration:
 *  - the actor needs team:manage;
 *  - the Owner role is never granted at runtime;
 *  - nobody grants a role higher than their own;
 *  - only the Owner grants the Admin role. */
export function canAssignRole(actorRole: string | null | undefined, newRole: string | null | undefined): boolean {
  if (!actorRole || !newRole) return false;
  if (!can(actorRole, "team", "manage")) return false;
  if (newRole === "owner") return false;
  if (roleRank(newRole) > roleRank(actorRole)) return false;
  if (newRole === "admin" && actorRole !== "owner") return false;
  return true;
}

/** Hierarchy guard: may `actorRole` change the assignment of a person
 *  whose current role is `currentRole`? (Self-changes are always
 *  refused — that check needs the user ids, so it lives in the UI and
 *  in the RPC; this covers the role-level rules.) */
export function canChangeAssignment(
  actorRole: string | null | undefined,
  currentRole: string | null | undefined,
  newRole: string | null | undefined,
): boolean {
  if (!actorRole) return false;
  // Only the Owner touches an Admin's (or the Owner's) assignment.
  if ((currentRole === "admin" || currentRole === "owner") && actorRole !== "owner") return false;
  return canAssignRole(actorRole, newRole);
}

/** Hierarchy guard: may `actorRole` activate/deactivate a person whose
 *  role is `targetRole`? The Owner account can never be deactivated,
 *  and deactivating an Admin is Owner-only. */
export function canSetActive(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
  isSelf: boolean,
): boolean {
  if (!actorRole || isSelf) return false;
  if (!can(actorRole, "team", "manage")) return false;
  if (targetRole === "owner") return false;
  if (targetRole === "admin" && actorRole !== "owner") return false;
  return true;
}
