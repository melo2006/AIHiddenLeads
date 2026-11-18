import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Phase 2.5 wiring pins (multi-tenant / reseller design, 2026-11-18
// §12). Source-level assertions for the server-side guarantees the
// pure-logic tests can't prove: demo actions are admin-only, the
// seed never writes the usage ledger, retail/catalog actions resolve
// scope from memberships (never the request body), the admin retail
// view is read-only, and the manual SQL carries the schema.

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("voice-agents Phase 2.5 actions", () => {
  const src = read("supabase/functions/voice-agents/index.ts");

  it("exposes the Phase 2.5 actions in the schema and the handler", () => {
    for (const action of [
      "demoStatus", "seedDemoData", "removeDemoData",
      "resellerRetail", "saveResellerRetail", "tenantRetail",
      "currencyRates", "saveCurrencyRates",
      "resellerCatalog", "saveResellerCatalog",
    ]) {
      expect(src).toContain(`'${action}'`);
      expect(src).toContain(`body.action==='${action}'`);
    }
  });

  it("demo seed/remove and currency rates are platform-admin only", () => {
    for (const action of ["seedDemoData", "removeDemoData", "currencyRates", "saveCurrencyRates", "tenantRetail"]) {
      const block = src.slice(src.indexOf(`body.action==='${action}'`), src.indexOf(`body.action==='${action}'`) + 400);
      expect(block).toContain("Administrator access required");
    }
  });

  it("the seed writes ZERO usage-ledger rows (demo figures live in demo_profile only)", () => {
    const seed = src.slice(src.indexOf("async function seedDemoOrgs"), src.indexOf("const SITE_BASE"));
    expect(seed).not.toContain("usage_events");
    expect(seed).not.toContain("gemini_voice_sessions");
    expect(seed).toContain("is_demo:true");
    expect(seed).toContain("demo_profile:");
    // Removal is shared by the refresh path and the admin action.
    expect(src).toContain("await removeDemoOrgs(db)");
  });

  it("retail and catalog actions resolve scope server-side, never from the body alone", () => {
    expect(src).toContain("resolveTenantOrg(db,user.id,admin,body.organizationId)");
    const retail = src.slice(src.indexOf("function buildRetailPayload"), src.indexOf("function buildCatalogPayload"));
    // The payload is built from tenantPriceView — the cost-free view.
    expect(retail).toContain("tenantPriceView(card)");
    expect(retail).toContain("customerRetailView(lines)");
  });

  it("the tenants rollup substitutes demo_profile for demo orgs, never the ledger", () => {
    expect(src).toContain("isDemoOrg(o)?normalizeDemoProfile(o.demo_profile):null");
    expect(src).toContain("isDemoOrg(root)?normalizeDemoProfile(root.demo_profile):null");
  });

  it("org reads degrade gracefully until the Phase 2.5 SQL is applied", () => {
    expect(src).toContain("ORG_RICH25");
    expect(src).toContain("is_demo,demo_profile,retail_prices,customer_currency,offered_catalog");
    expect(src).toContain("phase25ColumnsReady");
  });
});

describe("Phase 2.5 manual SQL", () => {
  const sql = read("supabase/manual-sql/2026-11-18-tenant-phase25.sql");
  it("adds the org columns and the currency table, idempotently", () => {
    for (const col of ["is_demo", "demo_profile", "retail_prices", "customer_currency", "offered_catalog"]) {
      expect(sql).toContain(`add column if not exists ${col}`);
    }
    expect(sql).toContain("create table if not exists public.tenant_currency_rates");
    expect(sql).toContain("enable row level security");
  });
});

describe("Phase 2.5 tenant surfaces stay white-label", () => {
  it("no vendor names in the new console components", () => {
    for (const f of ["src/components/crm/ResellerPricing.tsx", "src/components/crm/ResellerCatalog.tsx"]) {
      const s = read(f);
      for (const vendor of ["Simli", "ElevenLabs", "Gemini", "Twilio", "Telnyx"]) {
        expect(s).not.toContain(vendor);
      }
    }
  });
  it("the locked playout engine is not referenced by the new code", () => {
    for (const f of ["src/components/crm/ResellerPricing.tsx", "src/components/crm/ResellerCatalog.tsx", "src/lib/retailPricing.ts", "src/lib/currency.ts"]) {
      expect(read(f)).not.toContain("blobElementPlayout");
    }
  });
});
