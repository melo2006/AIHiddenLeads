// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Consent-flag wiring pins (Publish #49 follow-up, 2026-11-14).
//
// scan-website is a Deno entrypoint (Deno.serve + esm.sh imports), so
// it cannot be imported into vitest — its recording contract is pinned
// from the source, the same pattern fullpage-capture.test.ts uses.
// The behaviors behind these pins are unit-tested for real in
// consent-scan-probe.test.ts; the routing they feed is render-tested
// in consent-scan-flag-route.test.tsx.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const scanSource = read("../../supabase/functions/scan-website/index.ts");
const migration = read("../../supabase/migrations/20261114120000_leads_consent_banner_flags.sql");

describe("scan-website consent recording", () => {
  it("starts the Browserless consent probe in parallel with the captures", () => {
    const probeStart = scanSource.indexOf("probeConsentBannerViaBrowserless(formattedUrl, browserlessKey)");
    const capturesAwait = scanSource.indexOf("await browserlessPromise");
    expect(probeStart).toBeGreaterThan(-1);
    expect(capturesAwait).toBeGreaterThan(-1);
    expect(probeStart).toBeLessThan(capturesAwait);
  });

  it("falls back to the Firecrawl read-back evidence when the probe could not witness", () => {
    expect(scanSource).toContain("extractConsentEvidenceFromFirecrawlPayload(response)");
    expect(scanSource).toContain("consentScanFlagsFromEvidence(firecrawlFallback?.consentEvidence)");
  });

  it("merges the write sticky-true against the row's existing flags", () => {
    expect(scanSource).toContain("mergeConsentBannerFlags(");
    expect(scanSource).toContain("consent_banner_seen, consent_banner_dismissed");
  });

  it("writes both flag columns in their own update", () => {
    expect(scanSource).toContain("consent_banner_seen: consentFlags.seen");
    expect(scanSource).toContain("consent_banner_dismissed: consentFlags.dismissed");
  });

  it("writes the flags BEFORE the terminal scan_status save (the demo stops polling at terminal)", () => {
    const flagWrite = scanSource.indexOf("consent_banner_seen: consentFlags.seen");
    const terminalSave = scanSource.indexOf("scan_status: 'completed'");
    expect(flagWrite).toBeGreaterThan(-1);
    expect(terminalSave).toBeGreaterThan(-1);
    expect(flagWrite).toBeLessThan(terminalSave);
  });
});

describe("consent flag migration", () => {
  it("adds both columns additively", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS consent_banner_seen boolean");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS consent_banner_dismissed boolean");
  });

  it("recreates get_demo_lead with the consent columns appended at the END of the return table", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.get_demo_lead(uuid)");
    const createAt = migration.indexOf("CREATE FUNCTION public.get_demo_lead");
    const codeNotCompletedAt = migration.indexOf("code_not_completed boolean", createAt);
    const seenAt = migration.indexOf("consent_banner_seen boolean", createAt);
    const dismissedAt = migration.indexOf("consent_banner_dismissed boolean", createAt);
    expect(codeNotCompletedAt).toBeGreaterThan(-1);
    expect(seenAt).toBeGreaterThan(codeNotCompletedAt);
    expect(dismissedAt).toBeGreaterThan(seenAt);
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_demo_lead(uuid) TO anon");
  });
});
