import { describe, expect, it } from "vitest";
import { campaignIdFromTargetFilters, campaignOptionLabel } from "@/lib/campaignIds";
import { DEFAULT_FILTERS, normalizeFilters } from "@/components/crm/CRMFilters";

describe("campaignOptionLabel", () => {
  it("labels the Realtors regional campaign slugs", () => {
    expect(campaignOptionLabel("realtors-south-florida")).toBe("Realtors — South Florida");
    expect(campaignOptionLabel("realtors-dallas-fort-worth")).toBe("Realtors — Dallas-Fort Worth");
  });

  it("title-cases unknown slugs instead of showing the raw value", () => {
    expect(campaignOptionLabel("marine-south-florida")).toBe("Marine South Florida");
  });
});

describe("campaignIdFromTargetFilters", () => {
  it("returns the bound campaign_id slug", () => {
    expect(
      campaignIdFromTargetFilters({ campaign_group: "realtors", campaign_id: "realtors-south-florida" }),
    ).toBe("realtors-south-florida");
  });

  it("returns null when no campaign_id is bound", () => {
    expect(campaignIdFromTargetFilters({ campaign_group: "realtors" })).toBeNull();
    expect(campaignIdFromTargetFilters({})).toBeNull();
    expect(campaignIdFromTargetFilters(null)).toBeNull();
    expect(campaignIdFromTargetFilters("realtors-south-florida")).toBeNull();
    expect(campaignIdFromTargetFilters({ campaign_id: "  " })).toBeNull();
    expect(campaignIdFromTargetFilters({ campaign_id: 42 })).toBeNull();
  });
});

describe("normalizeFilters campaign handling", () => {
  it("defaults campaign to an empty selection", () => {
    expect(DEFAULT_FILTERS.campaign).toEqual([]);
    expect(normalizeFilters(null).campaign).toEqual([]);
    expect(normalizeFilters({}).campaign).toEqual([]);
  });

  it("accepts a legacy single-string campaign value", () => {
    expect(normalizeFilters({ campaign: "realtors-south-florida" }).campaign).toEqual([
      "realtors-south-florida",
    ]);
  });

  it("keeps an array of campaign slugs and drops blanks", () => {
    expect(
      normalizeFilters({ campaign: ["realtors-south-florida", "", "realtors-dallas-fort-worth"] }).campaign,
    ).toEqual(["realtors-south-florida", "realtors-dallas-fort-worth"]);
  });
});
