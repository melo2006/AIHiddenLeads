// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Structural guards for the rank-audit panel's closing pitch
 * (owner decision, 2026-11-09: "Keep voice + avatar only in the demo").
 * The audit itself — form, both modes, simulated/live grids, stats —
 * stays fully functional; only the closing sales pitch changes: the
 * 3-part growth timeline and the Maps Boost / Founder Plan buttons are
 * gone, replaced by a single CTA back to the live Aspen demo plus one
 * honest small-print line about add-ons.
 */

const panel = readFileSync(
  new URL("../components/landing/demo-results/RankAuditPanel.tsx", import.meta.url),
  "utf8",
);

describe("rank audit panel closing pitch (voice + avatar focus)", () => {
  it("drops the 3-Part Growth Timeline section entirely", () => {
    expect(panel).not.toContain("Our 3-Part Growth Timeline");
    expect(panel).not.toContain("3-Part Growth");
    expect(panel).not.toContain("Week 1 — Immediate ROI");
    expect(panel).not.toContain("Days 15–60");
  });

  it("removes the Maps Boost booking link and Founder Plan checkout link", () => {
    expect(panel).not.toContain("/book?offer=google-maps-boost");
    expect(panel).not.toContain("Request $");
    expect(panel).not.toContain("Google Maps Boost</Link>");
    expect(panel).not.toContain("/checkout?plan=essentials");
    expect(panel).not.toContain("Founder Plan");
    expect(panel).not.toContain("auditOffers");
  });

  it("closes with a single CTA back to the live demo", () => {
    expect(panel).toContain("See Aspen live on your website");
    // The CTA closes the sheet and scrolls to the demo intake form where
    // one exists, falling back to navigating to the demo page.
    expect(panel).toContain("goToDemo");
    expect(panel).toContain('getElementById("demo-intake")');
    expect(panel).toContain('navigate("/demo")');
    // Exactly one closing CTA button in the pitch block.
    expect(panel.match(/See Aspen live on your website/g)).toHaveLength(1);
  });

  it("keeps one honest small-print line about add-ons, with no guarantee", () => {
    expect(panel).toContain(
      "Google Maps Boost and AI Search Optimization are available as add-ons once you're a customer — we'll walk you through them on your follow-up call.",
    );
  });

  it("keeps the audit form, both modes and the Run Live button intact", () => {
    expect(panel).toContain("Exact business / branch name");
    expect(panel).toContain("Business website");
    expect(panel).toContain("Local Maps Grid");
    expect(panel).toContain("Nationwide Google Search");
    expect(panel).toContain("Target keyword");
    expect(panel).toContain("Run Live 25-Point Audit");
    expect(panel).toContain("demo-rank-audit");
  });

  it("keeps the simulated/live honesty labelling and results intact", () => {
    expect(panel).toContain("Simulated preview — not live rankings.");
    expect(panel).toContain("Serper Google");
    expect(panel).toContain("Avg rank");
    expect(panel).toContain("Top-3 visibility");
    expect(panel).toContain("Blind spots");
    expect(panel).toContain("simulatedRankGrid");
  });
});
