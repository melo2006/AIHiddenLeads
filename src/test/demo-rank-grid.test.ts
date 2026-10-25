// @vitest-environment node
import { describe, it, expect } from "vitest";
import { auditOffers, rankTone, simulatedRankGrid } from "../lib/demoRankGrid";
describe("demo audit rules", () => {
  it("has exactly 25 unique points in a 5x5 grid", () => {
    const points = simulatedRankGrid({ businessName: "Acme", city: "Miami", niche: "cleaning" });
    expect(points).toHaveLength(25);
    expect(new Set(points.map(p => `${p.row},${p.col}`)).size).toBe(25);
    expect(Math.max(...points.map(p => p.row))).toBe(4);
    expect(Math.max(...points.map(p => p.col))).toBe(4);
  });
  it("uses green for ranks 1–3", () => { expect(rankTone(1)).toBe("good"); expect(rankTone(3)).toBe("good"); });
  it("uses yellow for ranks 4–10", () => { expect(rankTone(4)).toBe("warning"); expect(rankTone(10)).toBe("warning"); });
  it("uses red for ranks 11+", () => { expect(rankTone(11)).toBe("bad"); expect(rankTone(20)).toBe("bad"); });
  it("keeps sample values stable and tailored to context", () => {
    const context = { businessName: "Acme", city: "Miami", niche: "cleaning" };
    expect(simulatedRankGrid(context)).toEqual(simulatedRankGrid(context));
    for (const change of [{ businessName: "Other" }, { city: "Tampa" }, { niche: "IT" }]) {
      expect(simulatedRankGrid({ ...context, ...change })).not.toEqual(simulatedRankGrid(context));
    }
  });
  it("prices Founder at $99/mo", () => expect(auditOffers.founder).toBe(99));
  it("prices separate Maps Boost at $149/mo", () => expect(auditOffers.mapsBoost).toBe(149));
  it("includes up to 50 monthly B2B leads", () => expect(auditOffers.monthlyLeads).toBe(50));
});