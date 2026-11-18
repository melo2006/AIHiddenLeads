import { describe, expect, it } from "vitest";
import {
  DEMO_CLIENTS,
  DEMO_EMAILS,
  DEMO_RESELLER,
  isDemoOrg,
  normalizeDemoProfile,
} from "@/lib/demoTenants";
import { AVATAR_LIBRARY } from "@/lib/avatarLibrary";
import { GEMINI_LIVE_VOICES } from "@/lib/voiceCatalog";

// Phase 2.5 demo tenants (design 2026-11-18 §12.1): the seeded
// presentation world. These tests pin the invariants that make it
// safe: believable and internally consistent figures, accounts the
// removal sweep can always find, a catalog that only references real
// library entries, and the is_demo marker doing its job.

describe("demo world — internal consistency", () => {
  it("client minutes and spend sum EXACTLY to the reseller's figures", () => {
    const sum = (pick: (s: { minutes: number; spendUsd: number; demoSpendUsd: number }) => number) =>
      DEMO_CLIENTS.reduce((a, c) => a + pick(c.stats), 0);
    expect(sum((s) => s.minutes)).toBe(DEMO_RESELLER.stats.minutes);
    expect(sum((s) => s.spendUsd)).toBeCloseTo(DEMO_RESELLER.stats.spendUsd, 2);
    // Demo spend is the reseller's OWN cost of running demos for
    // prospects — his clients never incur it, so it does not sum.
    expect(sum((s) => s.demoSpendUsd)).toBe(0);
    expect(DEMO_RESELLER.stats.demoSpendUsd).toBeGreaterThan(0);
  });
  it("the reseller sits in the 80% warning band on minutes, under every cap", () => {
    const pct = DEMO_RESELLER.stats.minutes / (DEMO_RESELLER.limits.minutesPool ?? 1);
    expect(pct).toBeGreaterThanOrEqual(0.8);
    expect(pct).toBeLessThan(1);
    expect(DEMO_RESELLER.stats.spendUsd).toBeLessThan(DEMO_RESELLER.limits.monthlySpendCapUsd ?? 0);
    expect(DEMO_RESELLER.stats.demoSpendUsd).toBeLessThan(DEMO_RESELLER.limits.demoBudgetUsd ?? 0);
    expect(DEMO_CLIENTS.length).toBeLessThan(DEMO_RESELLER.limits.maxClients ?? 0);
  });
  it("has 3–4 demo clients with distinct businesses, plans and assistants", () => {
    expect(DEMO_CLIENTS.length).toBeGreaterThanOrEqual(3);
    expect(DEMO_CLIENTS.length).toBeLessThanOrEqual(4);
    expect(new Set(DEMO_CLIENTS.map((c) => c.businessName)).size).toBe(DEMO_CLIENTS.length);
    expect(new Set(DEMO_CLIENTS.map((c) => c.planPriceId)).size).toBeGreaterThan(1);
  });
});

describe("demo world — accounts and removal", () => {
  it("every demo account email is in the sweep list, and all are unique", () => {
    const emails = [DEMO_RESELLER.email, ...DEMO_CLIENTS.map((c) => c.email)];
    expect(new Set(emails).size).toBe(emails.length);
    for (const e of emails) expect(DEMO_EMAILS).toContain(e);
    expect(DEMO_EMAILS.length).toBe(emails.length);
  });
  it("the demo company is invented — not a real reseller's business", () => {
    expect(DEMO_RESELLER.businessName).toBe("NorthPeak Partners");
    expect(DEMO_RESELLER.supportEmail.endsWith(".example")).toBe(true);
  });
});

describe("demo world — the marker and the profile", () => {
  it("isDemoOrg reads the flag strictly", () => {
    expect(isDemoOrg({ is_demo: true })).toBe(true);
    expect(isDemoOrg({ is_demo: false })).toBe(false);
    expect(isDemoOrg({})).toBe(false);
    expect(isDemoOrg(null)).toBe(false);
    expect(isDemoOrg({ is_demo: "true" })).toBe(false);
  });
  it("normalizeDemoProfile tolerates junk and keeps real figures", () => {
    expect(normalizeDemoProfile(null)).toBeNull();
    expect(normalizeDemoProfile("x")).toBeNull();
    expect(normalizeDemoProfile({ minutes: 10, spendUsd: 1.5, demoSpendUsd: 0, seededAt: "t" })).toEqual({
      minutes: 10, spendUsd: 1.5, demoSpendUsd: 0, seededAt: "t",
    });
    expect(normalizeDemoProfile({ minutes: -1, spendUsd: "a" })).toEqual({
      minutes: 0, spendUsd: 0, demoSpendUsd: 0, seededAt: "",
    });
  });
});

describe("demo world — seeded retail + catalog reference real data", () => {
  it("the retail sample exercises all three modes", () => {
    const modes = new Set(Object.values(DEMO_RESELLER.retailPrices).map((s) => s.mode));
    expect(modes).toEqual(new Set(["markup", "flat", "addon"]));
  });
  it("the catalog sample only references real avatars, voices and languages", () => {
    const avatarKeys = new Set(AVATAR_LIBRARY.map((a) => a.key));
    for (const k of DEMO_RESELLER.offeredCatalog.avatars ?? []) expect(avatarKeys.has(k)).toBe(true);
    const voiceIds = new Set(GEMINI_LIVE_VOICES.map((v) => v.id));
    for (const id of DEMO_RESELLER.offeredCatalog.voices ?? []) expect(voiceIds.has(id)).toBe(true);
    expect(DEMO_RESELLER.offeredCatalog.languages).toEqual(["en", "es"]);
    expect(DEMO_RESELLER.customerCurrency).toBe("CAD");
  });
});
