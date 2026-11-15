// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveForcedCoveredView } from "../lib/demoStartup";
import {
  REALTOR_EXAMPLE_PINNED_LEADS as SERVER_PINNED_LEADS,
  pinnedConsentBannerVerifiedForLeadId,
  pinnedForceCoveredViewForLeadId,
} from "../../supabase/functions/_shared/realtor-example-pinned-leads";
import { REALTOR_EXAMPLE_PINNED_LEADS as CLIENT_PINNED_LEADS } from "@/data/realtorExamplePinnedLeads";

/**
 * Pins for the forced covered view (Ray Miramontes fix, 2026-11-15).
 *
 * The pin must stay exactly what its name says — a PRESENTATION fact
 * ("this site refuses real browser framing; show the covered
 * screenshot view") — and must never blur into the consent pins,
 * which assert a different fact ("a human witnessed this site's
 * cookie banner"). These tests pin:
 *
 *  (a) Ray's example resolves to the covered presentation even when
 *      the embed probe says embeddable (the deployed verdict);
 *  (b) the other 13 examples are unaffected;
 *  (c) the semantics stay honest — Ray's pin carries no consent
 *      claim, Martinez's consent pin carries no presentation claim,
 *      no pin carries both, and the refresh path for the forced pin
 *      never writes a consent column.
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const refreshSource = read("../../supabase/functions/refresh-example-leads/index.ts");
const demoSiteSource = read("../pages/DemoSite.tsx");
const clientPinsSource = read("../data/realtorExamplePinnedLeads.ts");
const templateSource = read("../components/landing/AgentLandingTemplate.tsx");
const migrationSource = read(
  "../../supabase/migrations/20261115150000_leads_force_covered_view.sql",
);

const RAY = SERVER_PINNED_LEADS.find((entry) => entry.slug === "ray-miramontes");
const MARTINEZ = SERVER_PINNED_LEADS.find((entry) => entry.slug === "michael-martinez");

describe("forced covered view pin — the pinned map", () => {
  it("flags exactly one pin: ray-miramontes", () => {
    const flagged = SERVER_PINNED_LEADS.filter((entry) => entry.forceCoveredView === true);
    expect(flagged.map((entry) => entry.slug)).toEqual(["ray-miramontes"]);
    expect(RAY?.forceCoveredView).toBe(true);
  });

  it("resolves Ray's leadId to forced, and every other example leadId to not forced", () => {
    expect(RAY).toBeDefined();
    expect(pinnedForceCoveredViewForLeadId(RAY!.leadId)).toBe(true);
    for (const entry of CLIENT_PINNED_LEADS) {
      if (entry.slug === "ray-miramontes") continue;
      expect(
        pinnedForceCoveredViewForLeadId(entry.leadId),
        `${entry.slug} must be unaffected`,
      ).toBe(false);
    }
    expect(pinnedForceCoveredViewForLeadId(null)).toBe(false);
    expect(pinnedForceCoveredViewForLeadId(undefined)).toBe(false);
    expect(pinnedForceCoveredViewForLeadId("00000000-0000-4000-8000-000000000000")).toBe(false);
  });

  it("keeps the semantics honest: the forced pin makes no consent claim, and vice versa", () => {
    // Ray's pin must NOT claim a witnessed consent banner.
    expect(RAY?.consentBannerVerified).not.toBe(true);
    expect(pinnedConsentBannerVerifiedForLeadId(RAY!.leadId)).toBe(false);
    // Martinez's consent pin must NOT claim the presentation pin.
    expect(MARTINEZ?.consentBannerVerified).toBe(true);
    expect(MARTINEZ?.forceCoveredView).not.toBe(true);
    expect(pinnedForceCoveredViewForLeadId(MARTINEZ!.leadId)).toBe(false);
    // No pin carries both flags — the two facts never travel together.
    for (const entry of SERVER_PINNED_LEADS) {
      expect(
        entry.forceCoveredView === true && entry.consentBannerVerified === true,
        `${entry.slug} carries both pins`,
      ).toBe(false);
    }
  });

  it("stays server-only: the client pinned copy does not carry the field", () => {
    expect(clientPinsSource).not.toContain("forceCoveredView");
  });
});

describe("resolveForcedCoveredView — the stored pin outranks the probe", () => {
  it("forces the covered view even when the probe says embeddable (Ray's deployed verdict)", () => {
    expect(resolveForcedCoveredView(true, true)).toBe(true);
  });

  it("forces the covered view when the probe says blocked too", () => {
    expect(resolveForcedCoveredView(true, false)).toBe(true);
  });

  it("changes nothing without the stored pin, whatever the probe says", () => {
    expect(resolveForcedCoveredView(false, true)).toBe(false);
    expect(resolveForcedCoveredView(false, false)).toBe(false);
  });
});

describe("stored record path — migration, refresh re-assertion, DemoSite read", () => {
  it("migration adds the column and returns it from get_demo_lead, last", () => {
    expect(migrationSource).toContain(
      "ADD COLUMN IF NOT EXISTS force_covered_view boolean",
    );
    const fnStart = migrationSource.indexOf("CREATE FUNCTION public.get_demo_lead");
    const fnSource = migrationSource.slice(fnStart);
    expect(fnSource).toContain("force_covered_view boolean");
    expect(fnSource).toContain("l.force_covered_view");
    // Appended at the END (after website_language), per the #66 pattern.
    expect(fnSource.indexOf("force_covered_view")).toBeGreaterThan(
      fnSource.indexOf("website_language"),
    );
  });

  it("refresh re-asserts force_covered_view only for flagged pins, and never via the consent write", () => {
    expect(refreshSource).toContain("if (target.forceCoveredView) {");
    expect(refreshSource).toContain(".update({ force_covered_view: true })");
    expect(refreshSource).toContain("forceCoveredViewPinned");
    // The forced-view block writes ONLY its own column: slice the
    // block and prove no consent column appears inside it.
    const blockStart = refreshSource.indexOf("PINNED FORCED COVERED VIEW");
    const block = refreshSource.slice(blockStart, blockStart + 1200);
    expect(block).toContain("force_covered_view");
    expect(block).not.toContain("consent_banner_seen");
    expect(block).not.toContain("consent_banner_dismissed");
    // The consent re-assertion itself is untouched and still gated on
    // its own flag.
    expect(refreshSource).toContain("if (target.consentBannerVerified) {");
    expect(refreshSource).toContain(".update({ consent_banner_seen: true })");
  });

  it("DemoSite reads the pin from the stored record and gates the raw iframe on it", () => {
    expect(demoSiteSource).toContain("force_covered_view: boolean | null;");
    expect(demoSiteSource).toContain(
      "forceCoveredView: record.force_covered_view === true || current.forceCoveredView || undefined,",
    );
    expect(demoSiteSource).toContain("resolveForcedCoveredView(");
    // The raw iframe can never render on the forced route.
    expect(demoSiteSource).toContain("!isWebsiteUnreachable && !forceCoveredView,");
    // The screenshot fallback engages on the pin alone.
    expect(demoSiteSource).toContain(
      "hasScreenshotAsset && (forceCoveredView || isWebsiteUnreachable || requiresBrowserFallback || !hasIframeLoaded)",
    );
    // The pin is never derived from a consent field (honest semantics).
    expect(demoSiteSource).not.toContain(
      "forceCoveredView: record.consent_banner_seen",
    );
    expect(demoSiteSource).not.toContain(
      "forceCoveredView: record.consent_banner_dismissed",
    );
  });
});

describe("gallery rebuild — desktop + mobile card pair (2026-11-15)", () => {
  it("renders both captures per card, inside the one demo-running button", () => {
    expect(templateSource).toContain("EXAMPLE_THUMBNAILS[option.slug]");
    expect(templateSource).toContain("EXAMPLE_THUMBNAILS_MOBILE[option.slug]");
    expect(templateSource).toContain("onClick={() => runExampleDemo(option.url)}");
    // The header carries the owner's device line.
    expect(templateSource).toContain(
      "The demos can be viewed on a mobile phone, desktop, or",
    );
    expect(templateSource).toContain("tablet");
  });

  it("maps every one of the 14 examples in BOTH thumbnail maps", () => {
    for (const entry of CLIENT_PINNED_LEADS) {
      expect(templateSource).toContain(`"${entry.slug}": exampleThumb`);
      expect(templateSource).toContain(`"${entry.slug}": exampleThumbMobile`);
    }
  });

  it("ships a desktop and a mobile capture asset for every example", () => {
    for (const entry of CLIENT_PINNED_LEADS) {
      const desktop = new URL(
        `../assets/realtor-example-${entry.slug}.webp`,
        import.meta.url,
      );
      const mobile = new URL(
        `../assets/realtor-example-${entry.slug}-mobile.webp`,
        import.meta.url,
      );
      expect(existsSync(desktop), `desktop capture for ${entry.slug}`).toBe(true);
      expect(existsSync(mobile), `mobile capture for ${entry.slug}`).toBe(true);
    }
  });
});
