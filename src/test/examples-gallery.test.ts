// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXAMPLES_GALLERY,
  GALLERY_CATEGORY_ORDER,
  orderExamplesForDefaultView,
  type GalleryCategory,
} from "../data/examplesGallery";
import { REALTOR_EXAMPLE_PINNED_LEADS } from "../data/realtorExamplePinnedLeads";
import { B2B_EXAMPLE_PINNED_LEADS } from "../data/b2bExamplePinnedLeads";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

describe("examples gallery data (2026-11-18)", () => {
  it("combines all 22 B2B and all 14 realtor pinned examples", () => {
    expect(EXAMPLES_GALLERY).toHaveLength(
      B2B_EXAMPLE_PINNED_LEADS.length + REALTOR_EXAMPLE_PINNED_LEADS.length,
    );
    expect(EXAMPLES_GALLERY.filter((e) => e.kind === "b2b")).toHaveLength(22);
    expect(EXAMPLES_GALLERY.filter((e) => e.kind === "realtor")).toHaveLength(14);
  });

  it("every entry carries the pinned leadId + URL of its source map", () => {
    const bySlug = new Map(EXAMPLES_GALLERY.map((e) => [e.slug, e]));
    for (const entry of [...B2B_EXAMPLE_PINNED_LEADS, ...REALTOR_EXAMPLE_PINNED_LEADS]) {
      const gallery = bySlug.get(entry.slug);
      expect(gallery, entry.slug).toBeTruthy();
      expect(gallery!.leadId).toBe(entry.leadId);
      expect(gallery!.url).toBe(entry.url);
    }
    const slugs = EXAMPLES_GALLERY.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("B2B examples are labelled Aspen — the presenter their demos actually open with", () => {
    for (const entry of EXAMPLES_GALLERY.filter((e) => e.kind === "b2b")) {
      expect(entry.presenterName).toBe("Aspen");
    }
  });
});

describe("examples gallery categories (Ron's business-first mix, 2026-11-21)", () => {
  // The deliberate home for every example: realtors are one category
  // among many; each B2B slug's category follows its trade (pool
  // building/service and landscaping sit with the home services).
  const EXPECTED_CATEGORY: Record<string, GalleryCategory> = {
    "spodak-dental": "health-dental",
    "ts-roofing": "home-services",
    "cool-air-usa": "home-services",
    "madalon-law": "legal",
    "paradise-plumbing": "home-services",
    "national-brick-pavers": "home-services",
    "anco-precision": "manufacturing",
    "ast-manufacturing": "manufacturing",
    "cable-marine": "marine",
    "a2z-marine": "marine",
    "prestige-auto": "auto",
    autoscope: "auto",
    "ak-building-services": "business-services",
    "it-yall": "business-services",
    "essig-pools": "home-services",
    "az-pools": "home-services",
    "prestige-landscape": "home-services",
    "tropic-supply": "business-services",
    "royal-electrical-supply": "business-services",
    "mjm-manufacturing": "manufacturing",
    "westway-towing": "auto",
    "lan-infotech": "business-services",
  };

  it("every example carries exactly the category its trade belongs to", () => {
    for (const entry of EXAMPLES_GALLERY) {
      if (entry.kind === "realtor") {
        expect(entry.category, entry.slug).toBe("real-estate");
      } else {
        expect(entry.category, entry.slug).toBe(EXPECTED_CATEGORY[entry.slug]);
      }
    }
  });

  it("every filter category has at least one example — no dead chips", () => {
    for (const category of GALLERY_CATEGORY_ORDER) {
      expect(
        EXAMPLES_GALLERY.some((e) => e.category === category),
        category,
      ).toBe(true);
    }
    const counts = new Map<GalleryCategory, number>();
    for (const entry of EXAMPLES_GALLERY) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "real-estate": 14,
      "home-services": 7,
      "health-dental": 1,
      legal: 1,
      manufacturing: 3,
      marine: 2,
      auto: 3,
      "business-services": 5,
    });
  });

  it("the default view leads with businesses: first 9 hold 6 B2B and at most 3 realtors", () => {
    const ordered = orderExamplesForDefaultView(EXAMPLES_GALLERY);
    // Nothing lost, nothing duplicated, nothing invented.
    expect(ordered).toHaveLength(EXAMPLES_GALLERY.length);
    expect(new Set(ordered.map((e) => e.slug)).size).toBe(EXAMPLES_GALLERY.length);
    const firstNine = ordered.slice(0, 9);
    expect(firstNine.filter((e) => e.kind === "b2b")).toHaveLength(6);
    expect(firstNine.filter((e) => e.kind === "realtor").length).toBeLessThanOrEqual(3);
    expect(firstNine[0].kind).toBe("b2b");
    // All 14 realtors are still in the full default list.
    expect(ordered.filter((e) => e.kind === "realtor")).toHaveLength(14);
  });

  it("the default ordering holds its shape on a thumbed subset too", () => {
    const subset = EXAMPLES_GALLERY.filter((e) =>
      ["spodak-dental", "ts-roofing", "aurelia-perez", "ann-chamberlain"].includes(e.slug),
    );
    const ordered = orderExamplesForDefaultView(subset);
    expect(ordered.map((e) => e.slug)).toEqual([
      "spodak-dental",
      "ts-roofing",
      "aurelia-perez",
      "ann-chamberlain",
    ]);
  });
});

describe("examples gallery placement (2026-11-18)", () => {
  it("the homepage gallery replaces the DemoDifferentiator slot", () => {
    const index = read("pages/Index.tsx");
    expect(index).toContain("<ExamplesGallerySection />");
    expect(index).not.toContain("DemoDifferentiator");
  });

  it("the homepage gallery sits directly below the film gallery (Ron's placement call, 2026-11-21)", () => {
    const index = read("pages/Index.tsx");
    const films = index.indexOf("<FilmGallery />");
    const examples = index.indexOf("<ExamplesGallerySection />");
    const team = index.indexOf("<TeamSection />");
    expect(films).toBeGreaterThan(-1);
    expect(examples).toBeGreaterThan(films);
    expect(team).toBeGreaterThan(examples);
  });

  it("the before/after phone mockups are gone from the stats section", () => {
    const stats = read("components/landing/StatsSection.tsx");
    expect(stats).not.toContain("old-website-phone");
    expect(stats).not.toContain("new-website-phone");
    expect(stats).not.toContain("before Aspen, and after");
  });

  it("the demo page renders the gallery below the form, default variant only", () => {
    const tryDemo = read("pages/TryDemo.tsx");
    expect(tryDemo).toContain('variant === "default"');
    expect(tryDemo).toContain("<ExamplesGallerySection />");
    expect(tryDemo.indexOf("<ExamplesGallerySection />")).toBeGreaterThan(
      tryDemo.indexOf("<DemoIntakePanel"),
    );
  });

  it("cards launch the pinned sample demo through /demo", () => {
    const section = read("components/landing/ExamplesGallerySection.tsx");
    expect(section).toContain('sample: "1"');
    expect(section).toContain("leadId: example.leadId");
    expect(section).toContain("lg:grid-cols-3");
    expect(section).toContain("sm:grid-cols-2");
  });

  it("the grid is contained by a first-screenful + expand, not a scroll frame (2026-11-21)", () => {
    const section = read("components/landing/ExamplesGallerySection.tsx");
    expect(section).toContain("data-examples-gallery-grid");
    expect(section).toContain("GALLERY_PAGE_SIZE = 9");
    expect(section).toContain("examplesGallery.showAll");
    expect(section).toContain("examplesGallery.showLess");
    // The old bounded scroll frame and its hint are gone.
    expect(section).not.toContain("data-examples-gallery-scroll");
    expect(section).not.toContain("overflow-y-auto");
    expect(section).not.toContain("scrollHint");
  });

  it("the section filters by category and orders the default view business-first (2026-11-21)", () => {
    const section = read("components/landing/ExamplesGallerySection.tsx");
    expect(section).toContain("data-examples-gallery-filters");
    expect(section).toContain("GALLERY_CATEGORY_ORDER");
    expect(section).toContain("orderExamplesForDefaultView");
    expect(section).toContain("examplesGallery.filterAll");
    // Switching category collapses the grid back to the first screenful.
    expect(section).toContain("setExpanded(false)");
  });

  it("the closing strip lists other industries as text — never as demos — with the /demo CTA (2026-11-21)", () => {
    const section = read("components/landing/ExamplesGallerySection.tsx");
    expect(section).toContain("examplesGallery.moreTitle");
    expect(section).toContain("examplesGallery.moreText");
    expect(section).toContain("examplesGallery.moreNiches");
    expect(section).toContain("examplesGallery.moreCta");
    expect(section).toContain('navigate("/demo")');
  });
});
