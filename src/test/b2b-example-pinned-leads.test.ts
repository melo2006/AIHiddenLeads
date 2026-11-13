// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  B2B_EXAMPLE_PINNED_LEADS as CLIENT_PINNED,
  pinnedLeadIdForExampleUrl,
} from "../data/b2bExamplePinnedLeads";
import { B2B_EXAMPLE_PACKS } from "../data/b2bExampleServices";

const here = path.dirname(fileURLToPath(import.meta.url));
const sharedSource = fs.readFileSync(
  path.join(
    here,
    "..",
    "..",
    "supabase/functions/_shared/b2b-example-pinned-leads.ts",
  ),
  "utf8",
);

describe("b2b example pinned leads", () => {
  it("pins exactly one lead per B2B example pack", () => {
    expect(CLIENT_PINNED).toHaveLength(B2B_EXAMPLE_PACKS.length);
    expect(CLIENT_PINNED.map((p) => p.slug).sort()).toEqual(
      B2B_EXAMPLE_PACKS.map((p) => p.slug).sort(),
    );
    expect(CLIENT_PINNED.map((p) => p.url).sort()).toEqual(
      B2B_EXAMPLE_PACKS.map((p) => p.url).sort(),
    );
  });

  it("leadIds are plausible, unique UUIDs", () => {
    const ids = CLIENT_PINNED.map((p) => p.leadId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it("keeps the server copy in sync (same slugs, leadIds, urls)", () => {
    for (const entry of CLIENT_PINNED) {
      expect(sharedSource).toContain(`slug: "${entry.slug}"`);
      expect(sharedSource).toContain(entry.leadId);
      expect(sharedSource).toContain(entry.url);
    }
  });

  it("resolves an example URL to its pinned lead, www-insensitively", () => {
    for (const entry of CLIENT_PINNED) {
      expect(pinnedLeadIdForExampleUrl(entry.url)).toBe(entry.leadId);
      expect(pinnedLeadIdForExampleUrl(entry.url.replace("www.", ""))).toBe(
        entry.leadId,
      );
      const withWww = entry.url.includes("://www.")
        ? entry.url
        : entry.url.replace("://", "://www.");
      expect(pinnedLeadIdForExampleUrl(withWww)).toBe(entry.leadId);
    }
    expect(
      pinnedLeadIdForExampleUrl("https://not-an-example.example/"),
    ).toBeUndefined();
    expect(pinnedLeadIdForExampleUrl("not a url")).toBeUndefined();
  });

  it("balances the proposed presenters (Aspen at most 6, at least 4 distinct)", () => {
    const counts = new Map<string, number>();
    for (const entry of CLIENT_PINNED) {
      counts.set(entry.presenter, (counts.get(entry.presenter) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThanOrEqual(4);
    expect(counts.get("Aspen") ?? 0).toBeLessThanOrEqual(6);
    expect(counts.get("Frank") ?? 0).toBeGreaterThanOrEqual(2);
    expect(counts.get("Frank") ?? 0).toBeLessThanOrEqual(3);
  });
});
