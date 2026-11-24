// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

// Ron's order (2026-11-21): the homepage menu must jump straight to
// every major section — Customers (films), Examples (live demos),
// Benefits, Avatars — alongside the links that already existed, so
// nobody has to hunt down the page for pricing, etc.
const SECTION_LINKS: Array<[id: string, key: string]> = [
  ["services", "nav.services"],
  ["customers", "nav.customers"],
  ["examples", "nav.examples"],
  ["benefits", "nav.benefits"],
  ["avatar-gallery", "nav.avatars"],
  ["how-it-works", "nav.howItWorks"],
  ["pricing", "nav.pricing"],
  ["testimonials", "nav.testimonials"],
];

describe("navbar section links (2026-11-21)", () => {
  const nav = read("components/landing/LandingNavbar.tsx");

  it("one stacked menuLinks list carries all eight section links, rendered by both menus", () => {
    // Ron's follow-up (2026-11-21): the links must be STACKED in a
    // menu, not spread across the header bar. Both the desktop
    // dropdown and the mobile panel render this single list.
    for (const [id, key] of SECTION_LINKS) {
      expect(nav, `link ${id}`).toContain(`{ id: "${id}", label: t("${key}"`);
    }
    expect(nav.match(/menuLinks\.map/g)).toHaveLength(2);
    expect(nav).toContain('t("nav.menu", "Menu")');
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

// Menu cleanup (Ron's approval, 2026-11-24): Articles joins the main
// menu (the articles index was live with no menu entry), and the two
// help entries — "Help / FAQ" (homepage #faq jump) and "Help"
// (/help, below the divider) — merge into ONE Help entry → /help.
// The homepage FAQ section and its schema are NOT touched by this.
describe("navbar menu cleanup (2026-11-24)", () => {
  const nav = read("components/landing/LandingNavbar.tsx");

  it("Articles is a route entry in the shared menu list, after Examples", () => {
    expect(nav).toContain('{ to: "/articles", label: t("nav.articles", "Articles") }');
    expect(nav.indexOf('t("nav.examples"')).toBeLessThan(nav.indexOf('t("nav.articles"'));
    expect(nav.indexOf('t("nav.articles"')).toBeLessThan(nav.indexOf('t("nav.benefits"'));
    // The articles index route the entry points at is live in the router.
    expect(read("App.tsx")).toContain('path="/articles"');
  });

  it("exactly one Help entry total, pointing at /help", () => {
    expect(nav).toContain('{ to: "/help", label: t("nav.help", "Help") }');
    expect(nav.match(/nav\.help/g)).toHaveLength(1);
    expect(nav.match(/"\/help"/g)).toHaveLength(1);
  });

  it("no Help / FAQ menu entry remains", () => {
    expect(nav).not.toContain("nav.faq");
    expect(nav).not.toContain("Help / FAQ");
    expect(nav).not.toContain('{ id: "faq"');
  });

  it("Script stays as the below-divider route in both menus", () => {
    expect(nav.match(/to="\/transcript"/g)).toHaveLength(2);
  });

  it("Articles and Help labels exist in every locale the navbar ships", () => {
    for (const loc of ["en", "es", "fr", "pt-BR"]) {
      const json = JSON.parse(read(`i18n/locales/${loc}.json`));
      expect(json.nav.articles, loc).toBeTruthy();
      expect(json.nav.help, loc).toBeTruthy();
    }
  });
});
