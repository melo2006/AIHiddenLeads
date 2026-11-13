// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REALTOR_VERTICAL } from "@/data/agentVerticals";
import {
  REALTOR_EXAMPLE_PINNED_LEADS,
  pinnedLeadIdForExampleUrl,
} from "@/data/realtorExamplePinnedLeads";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
// Server copy consumed by the refresh-example-leads edge function.
const sharedSource = read("../../supabase/functions/_shared/realtor-example-pinned-leads.ts");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allOptions = (REALTOR_VERTICAL.demoExamples?.groups ?? []).flatMap(
  (group) => group.options,
);

describe("realtor example pinned leads", () => {
  it("pins exactly one lead per current example (14)", () => {
    expect(REALTOR_EXAMPLE_PINNED_LEADS).toHaveLength(14);
    expect(allOptions).toHaveLength(14);
    const slugs = REALTOR_EXAMPLE_PINNED_LEADS.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(14);
    const leadIds = REALTOR_EXAMPLE_PINNED_LEADS.map((entry) => entry.leadId);
    expect(new Set(leadIds).size).toBe(14);
    for (const leadId of leadIds) expect(leadId).toMatch(UUID_RE);
  });

  it("covers every dropdown/grid example with a matching slug and URL", () => {
    for (const option of allOptions) {
      const entry = REALTOR_EXAMPLE_PINNED_LEADS.find((e) => e.slug === option.slug);
      expect(entry, `missing pinned lead for ${option.slug}`).toBeDefined();
      expect(entry?.url).toBe(option.url);
    }
  });

  it("resolves each example URL to its pinned leadId (www-insensitive)", () => {
    for (const entry of REALTOR_EXAMPLE_PINNED_LEADS) {
      expect(pinnedLeadIdForExampleUrl(entry.url)).toBe(entry.leadId);
      const bare = entry.url.replace("://www.", "://");
      const withWww = entry.url.includes("://www.")
        ? entry.url
        : entry.url.replace("://", "://www.");
      expect(pinnedLeadIdForExampleUrl(bare)).toBe(entry.leadId);
      expect(pinnedLeadIdForExampleUrl(withWww)).toBe(entry.leadId);
    }
    expect(pinnedLeadIdForExampleUrl("https://not-an-example.example/")).toBeUndefined();
    expect(pinnedLeadIdForExampleUrl("not a url")).toBeUndefined();
  });

  it("keeps the server refresh copy on the same leadIds", () => {
    for (const entry of REALTOR_EXAMPLE_PINNED_LEADS) {
      expect(sharedSource).toContain(entry.leadId);
      expect(sharedSource).toContain(entry.slug);
    }
  });
});
