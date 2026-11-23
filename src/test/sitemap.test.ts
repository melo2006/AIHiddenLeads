// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const sitemap = read("../../public/sitemap.xml");
const robots = read("../../public/robots.txt");

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("public sitemap.xml", () => {
  it("lists exactly the verified public marketing pages", () => {
    // 2026-11-23 (SEO Phase 0): /demo/br (pre-rendered since Publish #71 but
    // never announced) plus /plans and /help, which now ship their own
    // pre-rendered heads instead of the homepage's.
    expect(locs).toEqual([
      "https://aihiddenleads.com/",
      "https://aihiddenleads.com/demo",
      "https://aihiddenleads.com/demo/br",
      "https://aihiddenleads.com/agents/realtors",
      "https://aihiddenleads.com/book",
      "https://aihiddenleads.com/plans",
      "https://aihiddenleads.com/help",
      "https://aihiddenleads.com/articles",
      "https://aihiddenleads.com/articles/ai-receptionist-cost",
      "https://aihiddenleads.com/articles/ai-receptionist-vs-answering-service",
      "https://aihiddenleads.com/articles/ai-receptionist-with-video-avatar",
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

  it("carries a lastmod for every URL (SEO Phase 0, 2026-11-23)", () => {
    // Deliberate reversal of the old "no lastmod (no fake freshness)" pin:
    // the 2026-11-23 deploy genuinely changed the served head of every
    // listed page, so the date is a real modification date, not decoration.
    // Keep it honest: bump these dates only when a listed page changes.
    const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    expect(lastmods).toHaveLength(locs.length);
    for (const d of lastmods) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("public robots.txt", () => {
  it("allows all crawlers and points at the sitemap", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://aihiddenleads.com/sitemap.xml");
  });
});
