// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REALTOR_EXAMPLE_PINNED_LEADS,
  applyPinnedServiceArea,
  pinnedConsentBannerVerifiedForLeadId,
  pinnedServiceAreaForLeadId,
} from "../../supabase/functions/_shared/realtor-example-pinned-leads";

// MARTINEZ PINS FIX (2026-11-14): michaelmartinezrealtor.com sits
// behind a Cloudflare bot check that walls the scan capture
// browsers; the consent probe records null on a wall by design, so
// the stale FALSE the pre-repair backfill wrote on the lead row
// could never self-heal, and the KB serviceArea — a free-text model
// answer re-derived per scan with no pinning — confabulated
// same-named realtors' cities (San Antonio TX / Greater Sacramento)
// for a South Florida business. The fix extends the pinned
// re-assertion pattern refresh-example-leads already used for
// website_url: a human-verified consent pin (Martinez only) and a
// recorded serviceArea per pin, asserted after every refresh
// regardless of scan outcome, plus a choke-point gate in
// scan-website where the profile's serviceArea is produced.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const refreshSource = read("../../supabase/functions/refresh-example-leads/index.ts");
const scanSource = read("../../supabase/functions/scan-website/index.ts");

const bySlug = (slug: string) =>
  REALTOR_EXAMPLE_PINNED_LEADS.find((entry) => entry.slug === slug);

describe("pinned facts on the shared map", () => {
  it("records a serviceArea for every one of the 14 pins", () => {
    expect(REALTOR_EXAMPLE_PINNED_LEADS).toHaveLength(14);
    for (const entry of REALTOR_EXAMPLE_PINNED_LEADS) {
      expect(entry.serviceArea, `${entry.slug} has no pinned serviceArea`).toBeTruthy();
      expect(entry.serviceArea!.trim().length).toBeGreaterThan(0);
    }
  });

  it("pins Martinez to the owner-verified South Florida", () => {
    expect(bySlug("michael-martinez")?.serviceArea).toBe("South Florida");
  });

  it("matches the example definitions' group areas for the other pins", () => {
    expect(bySlug("aurelia-perez")?.serviceArea).toBe("Broward County, FL");
    expect(bySlug("ann-chamberlain")?.serviceArea).toBe("Broward County, FL");
    expect(bySlug("julie-melrose")?.serviceArea).toBe("Broward County, FL");
    expect(bySlug("ashley-cusack")?.serviceArea).toBe("Miami-Dade County, FL");
    expect(bySlug("mauricio-barba")?.serviceArea).toBe("Miami-Dade County, FL");
    expect(bySlug("jean-luc-andriot")?.serviceArea).toBe("Palm Beach County, FL");
    expect(bySlug("paul-saperstein")?.serviceArea).toBe("Palm Beach County, FL");
    expect(bySlug("baldemar-deleon")?.serviceArea).toBe("Dallas, TX");
    expect(bySlug("logan-walter")?.serviceArea).toBe("Dallas, TX");
    expect(bySlug("ray-miramontes")?.serviceArea).toBe("Los Angeles, CA");
    expect(bySlug("danielle-lazier")?.serviceArea).toBe("San Francisco, CA");
    expect(bySlug("richard-steinberg")?.serviceArea).toBe("New York, NY");
    expect(bySlug("gian-sexsmith")?.serviceArea).toBe("Salt Lake City, UT");
  });

  it("flags the verified consent banner for michael-martinez ONLY", () => {
    const flagged = REALTOR_EXAMPLE_PINNED_LEADS.filter(
      (entry) => entry.consentBannerVerified === true,
    );
    expect(flagged.map((entry) => entry.slug)).toEqual(["michael-martinez"]);
  });

  it("resolves the helpers by leadId and stays inert for unknown leads", () => {
    const martinez = bySlug("michael-martinez")!;
    const saperstein = bySlug("paul-saperstein")!;
    expect(pinnedServiceAreaForLeadId(martinez.leadId)).toBe("South Florida");
    expect(pinnedServiceAreaForLeadId(saperstein.leadId)).toBe("Palm Beach County, FL");
    expect(pinnedConsentBannerVerifiedForLeadId(martinez.leadId)).toBe(true);
    expect(pinnedConsentBannerVerifiedForLeadId(saperstein.leadId)).toBe(false);
    expect(pinnedServiceAreaForLeadId("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(pinnedConsentBannerVerifiedForLeadId("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(pinnedServiceAreaForLeadId(null)).toBeNull();
    expect(pinnedConsentBannerVerifiedForLeadId(undefined)).toBe(false);
  });
});

describe("applyPinnedServiceArea", () => {
  it("replaces a confabulated SERVICE AREA line", () => {
    const kb = "BUSINESS NAME: Michael Martinez\nSERVICE AREA: San Antonio, Texas\nSUMMARY: x";
    expect(applyPinnedServiceArea(kb, "South Florida")).toBe(
      "BUSINESS NAME: Michael Martinez\nSERVICE AREA: South Florida\nSUMMARY: x",
    );
  });

  it("replaces EVERY occurrence (initial summary + research summary sections)", () => {
    const kb = [
      "BUSINESS NAME: Michael Martinez",
      "SERVICE AREA: San Antonio, Texas",
      "",
      "=== GENERATED RESEARCH SUMMARY (verify against original sources) ===",
      "BUSINESS NAME: Michael Martinez",
      "SERVICE AREA: Greater Sacramento Area",
    ].join("\n");
    const out = applyPinnedServiceArea(kb, "South Florida");
    expect(out.match(/^SERVICE AREA: South Florida$/gm)).toHaveLength(2);
    expect(out).not.toContain("San Antonio");
    expect(out).not.toContain("Sacramento");
  });

  it("inserts the line after BUSINESS NAME when the scan omitted it", () => {
    const kb = "BUSINESS NAME: Michael Martinez\nSUMMARY: x";
    expect(applyPinnedServiceArea(kb, "South Florida")).toBe(
      "BUSINESS NAME: Michael Martinez\nSERVICE AREA: South Florida\nSUMMARY: x",
    );
  });

  it("prepends when there is no BUSINESS NAME line, and stands alone on empty content", () => {
    expect(applyPinnedServiceArea("SUMMARY: x", "South Florida")).toBe(
      "SERVICE AREA: South Florida\nSUMMARY: x",
    );
    expect(applyPinnedServiceArea(null, "South Florida")).toBe("SERVICE AREA: South Florida");
    expect(applyPinnedServiceArea("", "South Florida")).toBe("SERVICE AREA: South Florida");
  });

  it("is idempotent — asserting an already-pinned text returns it unchanged", () => {
    const kb = "BUSINESS NAME: Michael Martinez\nSERVICE AREA: San Antonio, Texas\nSUMMARY: x";
    const once = applyPinnedServiceArea(kb, "South Florida");
    expect(applyPinnedServiceArea(once, "South Florida")).toBe(once);
    const already = "BUSINESS NAME: X\nSERVICE AREA: South Florida";
    expect(applyPinnedServiceArea(already, "South Florida")).toBe(already);
  });
});

describe("refresh-example-leads asserts the pins whatever the scan did", () => {
  it("re-asserts consent_banner_seen=true, gated on the pin's verified flag", () => {
    expect(refreshSource).toContain("if (target.consentBannerVerified)");
    expect(refreshSource).toContain(".update({ consent_banner_seen: true })");
    expect(refreshSource).toContain("consentBannerSeenPinned = !consentError;");
  });

  it("re-asserts the pinned service area into the stored knowledge, gated on the pin", () => {
    expect(refreshSource).toContain("if (target.serviceArea)");
    expect(refreshSource).toContain("applyPinnedServiceArea(currentContent, target.serviceArea)");
    expect(refreshSource).toContain(".update({ website_content: assertedContent })");
    expect(refreshSource).toContain("serviceAreaPinned");
  });

  it("runs the assertions AFTER the scan try/catch, not inside it", () => {
    // The scan outcome is captured (scan_invoke_failed) and execution
    // falls through to the assertions — a walled or failed scan must
    // not skip them; that is the whole point of the consent pin.
    const scanCatchAt = refreshSource.indexOf("scan_invoke_failed");
    const consentAssertAt = refreshSource.indexOf(".update({ consent_banner_seen: true })");
    const areaAssertAt = refreshSource.indexOf(".update({ website_content: assertedContent })");
    expect(scanCatchAt).toBeGreaterThan(-1);
    expect(consentAssertAt).toBeGreaterThan(scanCatchAt);
    expect(areaAssertAt).toBeGreaterThan(scanCatchAt);
  });
});

describe("scan-website gates the model's serviceArea at the profile choke point", () => {
  it("substitutes the pin right after the profile is built", () => {
    const profileAt = scanSource.indexOf("const profile = await analyzeBusinessProfile({");
    const gateAt = scanSource.indexOf("profile.serviceArea = pinnedServiceArea;");
    expect(profileAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(profileAt);
    expect(scanSource).toContain("if (isPinnedExampleLead)");
    expect(scanSource).toContain(".find((entry) => entry.leadId === leadId)?.serviceArea");
  });
});
