import { describe, expect, it } from "vitest";
import {
  AREA_ACTIONS,
  PLATFORM_ROLES,
  ROLE_PERMISSIONS,
  can,
  canAssignRole,
  canChangeAssignment,
  canSetActive,
  roleRank,
} from "../lib/rbac";

// Pins the client mirror of the RBAC matrix (design §3) and the
// hierarchy guards. The database seed in
// supabase/migrations/20261120120000_rbac_admin.sql must carry the
// same grants — if these tests and the SQL ever disagree, the SQL is
// the authority and one of them is the bug.

describe("rbac matrix resolution", () => {
  it("owner holds every permission in the grid", () => {
    for (const [area, actions] of Object.entries(AREA_ACTIONS)) {
      for (const action of actions) {
        expect(can("owner", area as never, action), `owner ${area}:${action}`).toBe(true);
      }
    }
  });

  it("campaign send is Admin+ only", () => {
    expect(can("owner", "campaigns", "send")).toBe(true);
    expect(can("admin", "campaigns", "send")).toBe(true);
    expect(can("operations_manager", "campaigns", "send")).toBe(false);
    expect(can("sales_assistant", "campaigns", "send")).toBe(false);
    expect(can("support", "campaigns", "send")).toBe(false);
    expect(can("read_only", "campaigns", "send")).toBe(false);
  });

  it("client and reseller delete are Owner-only", () => {
    for (const role of ["admin", "operations_manager", "sales_assistant", "support", "read_only"]) {
      expect(can(role, "clients", "delete"), `${role} clients:delete`).toBe(false);
      expect(can(role, "resellers", "delete"), `${role} resellers:delete`).toBe(false);
    }
    expect(can("owner", "clients", "delete")).toBe(true);
    expect(can("owner", "resellers", "delete")).toBe(true);
  });

  it("billing change is Owner-only, billing view is limited", () => {
    expect(can("owner", "billing", "change")).toBe(true);
    for (const role of ["admin", "operations_manager", "sales_assistant", "support", "read_only"]) {
      expect(can(role, "billing", "change"), `${role} billing:change`).toBe(false);
    }
    expect(can("admin", "billing", "view")).toBe(true);
    expect(can("operations_manager", "billing", "view")).toBe(true);
    expect(can("read_only", "billing", "view")).toBe(true);
    expect(can("sales_assistant", "billing", "view")).toBe(false);
    expect(can("support", "billing", "view")).toBe(false);
  });

  it("read-only never holds a write action anywhere", () => {
    for (const [area, actions] of Object.entries(AREA_ACTIONS)) {
      for (const action of actions) {
        if (action === "view") continue;
        expect(can("read_only", area as never, action), `read_only ${area}:${action}`).toBe(false);
      }
    }
  });

  it("sales assistant cannot see resellers, billing, settings or team", () => {
    for (const area of ["resellers", "billing", "settings", "team", "audit"] as const) {
      expect(can("sales_assistant", area, "view"), `sales ${area}:view`).toBe(false);
    }
    expect(can("sales_assistant", "clients", "edit")).toBe(true);
    expect(can("sales_assistant", "leads", "edit")).toBe(true);
  });

  it("support reads broadly but creates nothing and cannot send", () => {
    expect(can("support", "clients", "view")).toBe(true);
    expect(can("support", "clients", "create")).toBe(false);
    expect(can("support", "campaigns", "create")).toBe(false);
    expect(can("support", "content", "edit")).toBe(true);
  });

  it("team and audit are Owner/Admin only", () => {
    for (const role of ["operations_manager", "sales_assistant", "support", "read_only"]) {
      expect(can(role, "team", "view"), `${role} team:view`).toBe(false);
      expect(can(role, "team", "manage"), `${role} team:manage`).toBe(false);
      expect(can(role, "audit", "view"), `${role} audit:view`).toBe(false);
    }
  });

  it("unknown or missing roles hold nothing", () => {
    expect(can(null, "clients", "view")).toBe(false);
    expect(can(undefined, "clients", "view")).toBe(false);
    expect(can("superuser", "clients", "view")).toBe(false);
  });

  it("every preset role key resolves in the matrix and ranks descend", () => {
    const ranks = PLATFORM_ROLES.map((r) => r.rank);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    for (const role of PLATFORM_ROLES) {
      expect(ROLE_PERMISSIONS[role.key], role.key).toBeDefined();
      expect(roleRank(role.key)).toBe(role.rank);
    }
  });
});

describe("rbac hierarchy guards", () => {
  it("only the Owner can grant the Admin role", () => {
    expect(canAssignRole("owner", "admin")).toBe(true);
    expect(canAssignRole("admin", "admin")).toBe(false);
    expect(canAssignRole("operations_manager", "admin")).toBe(false);
  });

  it("the Owner role itself is never granted at runtime", () => {
    expect(canAssignRole("owner", "owner")).toBe(false);
    expect(canAssignRole("admin", "owner")).toBe(false);
  });

  it("nobody grants a role higher than their own", () => {
    expect(canAssignRole("admin", "operations_manager")).toBe(true);
    expect(canAssignRole("operations_manager", "admin")).toBe(false);
    expect(canAssignRole("support", "read_only")).toBe(false); // support has no team:manage at all
  });

  it("roles without team:manage cannot assign anything", () => {
    for (const role of ["operations_manager", "sales_assistant", "support", "read_only"]) {
      expect(canAssignRole(role, "read_only"), role).toBe(false);
    }
    expect(canAssignRole(null, "read_only")).toBe(false);
  });

  it("only the Owner changes an Admin's assignment", () => {
    expect(canChangeAssignment("owner", "admin", "operations_manager")).toBe(true);
    expect(canChangeAssignment("admin", "admin", "operations_manager")).toBe(false);
    expect(canChangeAssignment("admin", "operations_manager", "sales_assistant")).toBe(true);
    expect(canChangeAssignment("admin", "owner", "admin")).toBe(false);
  });

  it("deactivation: never self, never the Owner, Admins are Owner-only", () => {
    expect(canSetActive("owner", "admin", false)).toBe(true);
    expect(canSetActive("admin", "admin", false)).toBe(false);
    expect(canSetActive("admin", "support", false)).toBe(true);
    expect(canSetActive("owner", "owner", false)).toBe(false);
    expect(canSetActive("owner", "support", true)).toBe(false); // self
    expect(canSetActive("support", "read_only", false)).toBe(false); // no team:manage
  });
});
