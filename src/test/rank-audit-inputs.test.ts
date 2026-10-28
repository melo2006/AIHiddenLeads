// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rankAuditExamples, validateAuditInputs } from "../lib/rankAuditExamples";
describe("rank audit inputs", () => {
  it("requires a location for a local business", () => expect(validateAuditInputs("maps", "Plumber", "", "plumber", "example.com")).not.toBeNull());
  it("accepts nationwide businesses without a city", () => expect(validateAuditInputs("nationwide", "Supplier", "", "industrial supplies", "example.com")).toBeNull());
  it("requires a service keyword rather than silently substituting local services", () => expect(validateAuditInputs("maps", "Plumber", "Miami, FL", "", "example.com")).not.toBeNull());
  it("requires a valid nationwide website", () => expect(validateAuditInputs("nationwide", "Supplier", "", "supplies", "")).not.toBeNull());
  it("offers four typical B2B categories instead of enterprise examples", () => {
    expect(rankAuditExamples).toHaveLength(4);
    expect(rankAuditExamples.map(e => e.id)).toEqual(["cleaning", "manufacturer", "hvac", "supplier"]);
    expect(rankAuditExamples.some(e => /LinkedIn|BankUnited/i.test(e.name))).toBe(false);
  });
  it("uses a commercial buyer keyword for the cleaning example", () => {
    const cleaner = rankAuditExamples.find(e => e.id === "cleaning");
    expect(cleaner?.keyword).toBe("commercial cleaning");
    expect(cleaner?.mode).toBe("maps");
    expect(cleaner?.location).toBe("Grand Rapids, MI");
  });
  it("includes a nationwide packaging supplier with its actual location retained", () => { const supplier = rankAuditExamples.find(e => e.id === "supplier"); expect(supplier?.mode).toBe("nationwide"); expect(supplier?.keyword).toBe("industrial packaging supplies"); expect(supplier?.location).toBe("Grand Rapids, MI"); });
});