import { describe, expect, it } from "vitest";
import {
  normalizeBranding, planLabel, resolveBrand, shapeClients, suggestProspectMatch,
  type ClientPayload, type ProspectLite,
} from "@/lib/clients";

// Clients view shaping + tenant branding (multi-tenant / reseller
// design Phase 1, 2026-11-18). The voice-agents `clients` action joins
// auth user + subscription + workspace + org server-side; these tests
// pin how the flat payload becomes display rows — including the wild
// cases: zero customers, missing subscription, missing profile name,
// missing branding (pre-SQL rows), and a reseller parent org.

const full: ClientPayload = {
  userId: "user-1",
  email: "Maria@Example.com",
  customerName: "Maria Lopez",
  organizationId: "org-1",
  businessName: "Lopez Dental",
  organizationType: "client",
  organizationStatus: "active",
  parentOrganizationId: null,
  parentOrganizationName: null,
  agentId: "agent-1",
  environment: "live",
  planPriceId: "essentials_monthly",
  subscriptionStatus: "active",
  currentPeriodEnd: "2026-12-01T00:00:00Z",
  joinedAt: "2026-11-02T00:00:00Z",
  linkedProspectId: "prospect-1",
};

describe("shapeClients", () => {
  it("shapes a full customer row: name, plan label, Direct tenant", () => {
    const [row] = shapeClients([full]);
    expect(row.customerName).toBe("Maria Lopez");
    expect(row.email).toBe("Maria@Example.com");
    expect(row.businessName).toBe("Lopez Dental");
    expect(row.planLabel).toBe("Premium · $99/mo");
    expect(row.statusLabel).toBe("active");
    expect(row.tenantLabel).toBe("Direct");
    expect(row.linkedProspectId).toBe("prospect-1");
  });

  it("zero customers shapes to an empty list, and junk payloads too", () => {
    expect(shapeClients([])).toEqual([]);
    expect(shapeClients(null)).toEqual([]);
    expect(shapeClients(undefined)).toEqual([]);
  });

  it("missing subscription reads honestly as No plan / No subscription", () => {
    const [row] = shapeClients([{ ...full, planPriceId: null, subscriptionStatus: null, currentPeriodEnd: null }]);
    expect(row.planLabel).toBe("No plan");
    expect(row.statusLabel).toBe("No subscription");
  });

  it("missing profile name falls back to the email, then to a placeholder", () => {
    const [byEmail] = shapeClients([{ ...full, customerName: null }]);
    expect(byEmail.customerName).toBe("Maria@Example.com");
    const [anon] = shapeClients([{ ...full, customerName: null, email: null }]);
    expect(anon.customerName).toBe("Unknown customer");
  });

  it("a reseller parent org names the tenant; blank parent name stays Direct", () => {
    const [row] = shapeClients([{ ...full, parentOrganizationId: "org-parent", parentOrganizationName: "B2 Tecnologia" }]);
    expect(row.tenantLabel).toBe("B2 Tecnologia");
    const [blank] = shapeClients([{ ...full, parentOrganizationId: "org-parent", parentOrganizationName: "  " }]);
    expect(blank.tenantLabel).toBe("Direct");
  });

  it("missing org fields (pre-SQL row) degrade to safe defaults", () => {
    const [row] = shapeClients([{
      userId: "user-9", organizationId: "org-9",
    }]);
    expect(row.businessName).toBe("Unknown business");
    expect(row.organizationStatus).toBe("active");
    expect(row.tenantLabel).toBe("Direct");
    expect(row.agentId).toBeNull();
  });
});

describe("planLabel", () => {
  it("maps the three plans and the avatar add-on; unknown ids pass through", () => {
    expect(planLabel("essentials_monthly")).toBe("Premium · $99/mo");
    expect(planLabel("growth_monthly")).toBe("Pro · $199/mo");
    expect(planLabel("fullservice_monthly")).toBe("Platinum · $349/mo");
    expect(planLabel("video_avatar_monthly")).toBe("Video avatar add-on · $79/mo");
    expect(planLabel("mystery_price")).toBe("mystery_price");
    expect(planLabel(null)).toBe("No plan");
  });
});

describe("suggestProspectMatch", () => {
  const prospects: ProspectLite[] = [
    { id: "p-1", business_name: "Lopez Dental", email: "info@lopezdental.com", owner_email: "maria@example.com" },
    { id: "p-2", business_name: "Other Co", email: "hello@other.com", owner_email: null },
    { id: "p-3", business_name: "Taken Co", email: "taken@example.com", owner_email: null, converted_organization_id: "org-x" },
  ];

  it("matches on the prospect contact email, case-insensitively", () => {
    expect(suggestProspectMatch("INFO@LopezDental.com", prospects)?.id).toBe("p-1");
  });

  it("matches on the prospect owner email", () => {
    expect(suggestProspectMatch("maria@example.com", prospects)?.id).toBe("p-1");
  });

  it("never suggests an already-linked prospect, and no email means no suggestion", () => {
    expect(suggestProspectMatch("taken@example.com", prospects)).toBeNull();
    expect(suggestProspectMatch(null, prospects)).toBeNull();
    expect(suggestProspectMatch("nobody@example.com", prospects)).toBeNull();
    expect(suggestProspectMatch("maria@example.com", null)).toBeNull();
  });
});

describe("normalizeBranding + resolveBrand", () => {
  it("null and empty payloads normalize to no branding", () => {
    expect(normalizeBranding(null)).toBeNull();
    expect(normalizeBranding(undefined)).toBeNull();
    expect(normalizeBranding({})).toBeNull();
    expect(normalizeBranding({ name: "  ", logoUrl: "" })).toBeNull();
    expect(normalizeBranding("nope")).toBeNull();
  });

  it("trims fields and keeps a name-only branding record", () => {
    const b = normalizeBranding({ name: " B2 Tecnologia ", logoUrl: null, slogan: " Atendemos por você " });
    expect(b).toEqual({
      name: "B2 Tecnologia", logoUrl: null, slogan: "Atendemos por você", supportEmail: null, brandColor: null,
    });
  });

  it("no branding, or branding without a logo, resolves to the platform brand", () => {
    expect(resolveBrand(null)).toEqual({ source: "platform" });
    expect(resolveBrand(undefined)).toEqual({ source: "platform" });
    // Name-only / slogan-only orgs (every pre-Phase-1 customer) keep the
    // platform lockup — nobody's header changes until a logo is set.
    expect(resolveBrand(normalizeBranding({ name: "Lopez Dental" }))).toEqual({ source: "platform" });
    expect(resolveBrand(normalizeBranding({ slogan: "We answer for you" }))).toEqual({ source: "platform" });
  });

  it("a logo takes over the header, with the org name", () => {
    const b = normalizeBranding({ name: "B2 Tecnologia", logoUrl: "https://example.com/logo.png" });
    expect(resolveBrand(b)).toEqual({ source: "org", name: "B2 Tecnologia", logoUrl: "https://example.com/logo.png" });
  });

  it("a logo without a name falls back to the platform name text", () => {
    const b = normalizeBranding({ logoUrl: "https://example.com/logo.png" });
    expect(resolveBrand(b)).toEqual({ source: "org", name: "AI Hidden Leads", logoUrl: "https://example.com/logo.png" });
  });
});
