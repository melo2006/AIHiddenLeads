// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

// Ron's order (2026-11-21): the homepage menu must jump straight to
// every major section — Customers (films), Examples (live demos),
// Benefits, Avatars — alongside the links that already existed, so
// nobody has to hunt down the page for pricing, FAQ, etc.
const SECTION_LINKS: Array<[id: string, key: string]> = [
  ["services", "nav.services"],
  ["customers", "nav.customers"],
  ["examples", "nav.examples"],
  ["benefits", "nav.benefits"],
  ["avatar-gallery", "nav.avatars"],
  ["how-it-works", "nav.howItWorks"],
  ["pricing", "nav.pricing"],
  ["testimonials", "nav.testimonials"],
  ["faq", "nav.faq"],
];

describe("navbar section links (2026-11-21)", () => {
  const nav = read("components/landing/LandingNavbar.tsx");

  it("desktop bar and mobile menu both carry all nine section links", () => {
    for (const [id, key] of SECTION_LINKS) {
      // Desktop: a scrollTo button. Mobile: an entry in the menu array.
      expect(nav, `desktop ${id}`).toContain(`scrollTo("${id}")`);
      expect(nav, `mobile ${id}`).toContain(`{ id: "${id}", label: t("${key}"`);
    }
  });

  it("every target section exists with a matching id", () => {
    expect(read("components/landing/FilmGallery.tsx")).toContain('id="customers"');
    expect(read("components/landing/ExamplesGallerySection.tsx")).toContain('id="examples"');
    expect(read("components/landing/StatsSection.tsx")).toContain('id="benefits"');
    expect(read("components/landing/AvatarGallerySection.tsx")).toContain('id="avatar-gallery"');
    expect(read("components/landing/SpokespersonSection.tsx")).toContain('id="spokesperson"');
  });

  it("anchored sections clear the fixed header via the global rule", () => {
    expect(read("index.css")).toContain("section[id]");
    expect(read("index.css")).toContain("scroll-margin-top");
  });
});
