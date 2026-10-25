// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rankAuditExamples, validateAuditInputs } from "../lib/rankAuditExamples";
describe("rank audit inputs", () => {
  it("requires a location for a local business", () => expect(validateAuditInputs("maps", "Plumber", "", "plumber", "example.com")).not.toBeNull());
  it("accepts nationwide businesses without a city", () => expect(validateAuditInputs("nationwide", "Supplier", "", "industrial supplies", "example.com")).toBeNull());
  it("requires a service keyword rather than silently substituting local services", () => expect(validateAuditInputs("maps", "Plumber", "Miami, FL", "", "example.com")).not.toBeNull());
  it("requires a valid nationwide website", () => expect(validateAuditInputs("nationwide", "Supplier", "", "supplies", "")).not.toBeNull());
  it("keeps BankUnited scoped to a specified branch address", () => { const bank = rankAuditExamples.find(e => e.id === "bank"); expect(bank?.mode).toBe("maps"); expect(bank?.location).toBe("337 E Las Olas Blvd, Fort Lauderdale, FL 33301"); });
  it("includes a nationwide B2B example without an invented city", () => { const supplier = rankAuditExamples.find(e => e.id === "supplier"); expect(supplier?.mode).toBe("nationwide"); expect(supplier?.location).toBe(""); });
});