// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MAX_NAME_VARIANTS,
  businessNameVariants,
  hasLegalSuffix,
  splitCamelName,
  stripLegalSuffix,
} from "../../supabase/functions/_shared/places-name-variants";

describe("businessNameVariants (demo-rank-audit Places retry)", () => {
  it("splits a camel-case brand into its spaced form — the AiHiddenLeads dogfood case", () => {
    expect(businessNameVariants("AiHiddenLeads")).toEqual([
      "AiHiddenLeads",
      "Ai Hidden Leads",
      "AiHiddenLeads LLC",
    ]);
  });

  it("keeps an already-spaced name first and only adds the suffix variant", () => {
    expect(businessNameVariants("AI Hidden Leads")).toEqual(["AI Hidden Leads", "AI Hidden Leads LLC"]);
  });

  it("strips a legal suffix instead of appending one", () => {
    expect(businessNameVariants("Acme Roofing LLC")).toEqual(["Acme Roofing LLC", "Acme Roofing"]);
    expect(businessNameVariants("Acme Roofing Inc.")).toEqual(["Acme Roofing Inc.", "Acme Roofing"]);
  });

  it("combines camel-split with suffix stripping within the cap", () => {
    expect(businessNameVariants("AiHiddenLeads LLC")).toEqual([
      "AiHiddenLeads LLC",
      "Ai Hidden Leads LLC",
      "AiHiddenLeads",
    ]);
  });

  it("never exceeds the lookup cap and never duplicates", () => {
    for (const name of ["AiHiddenLeads", "Smith&Co LLC", "A B C Inc", "Acme", "XYZPlumbing LLC"]) {
      const variants = businessNameVariants(name);
      expect(variants.length).toBeLessThanOrEqual(MAX_NAME_VARIANTS);
      expect(new Set(variants.map((v) => v.toLowerCase())).size).toBe(variants.length);
      expect(variants[0]).toBe(name);
    }
  });

  it("handles empty and whitespace input honestly (no variants, lookup will fail as before)", () => {
    expect(businessNameVariants("")).toEqual([]);
    expect(businessNameVariants("   ")).toEqual([]);
  });
});

describe("variant helpers", () => {
  it("splitCamelName handles acronym runs and ampersands", () => {
    expect(splitCamelName("AiHiddenLeads")).toBe("Ai Hidden Leads");
    expect(splitCamelName("AIHiddenLeads")).toBe("AI Hidden Leads");
    expect(splitCamelName("Smith&Co")).toBe("Smith & Co");
    expect(splitCamelName("Plain Name")).toBe("Plain Name");
  });

  it("suffix helpers agree", () => {
    expect(hasLegalSuffix("Acme Roofing LLC")).toBe(true);
    expect(hasLegalSuffix("Acme Roofing")).toBe(false);
    expect(stripLegalSuffix("Acme Roofing, Inc.")).toBe("Acme Roofing");
    expect(stripLegalSuffix("Acme Roofing Corp")).toBe("Acme Roofing");
  });
});
