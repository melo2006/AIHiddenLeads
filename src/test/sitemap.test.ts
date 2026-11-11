// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const sitemap = read("../../public/sitemap.xml");
const robots = read("../../public/robots.txt");

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("public sitemap.xml", () => {
  it("lists exactly the verified public marketing pages", () => {
    expect(locs).toEqual([
      "https://aihiddenleads.com/",
      "https://aihiddenleads.com/demo",
      "https://aihiddenleads.com/agents/realtors",
      "https://aihiddenleads.com/book",
    ]);
  });

  it("never lists per-prospect, per-booking or signed-in surfaces", () => {
    // Only <loc> entries count — the file comment names the excluded
    // surfaces on purpose, so scan the extracted locs, not the raw file.
    const listed = locs.join("\n");
    for (const loc of locs) {
      expect(loc).not.toMatch(/\/demo\/[^/]+\//);
    }
    expect(listed).not.toContain("/cal/");
    expect(listed).not.toContain("/setup");
    expect(listed).not.toContain("/dashboard");
    expect(listed).not.toContain("/voice-lab");
    expect(listed).not.toContain("/agents/mortgage");
    expect(listed).not.toContain("/agents/insurance");
  });

  it("carries no lastmod dates (no fake freshness)", () => {
    expect(sitemap).not.toContain("<lastmod>");
  });
});

describe("public robots.txt", () => {
  it("allows all crawlers and points at the sitemap", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://aihiddenleads.com/sitemap.xml");
  });
});
