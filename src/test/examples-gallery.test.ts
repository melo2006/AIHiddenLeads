// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXAMPLES_GALLERY } from "../data/examplesGallery";
import { REALTOR_EXAMPLE_PINNED_LEADS } from "../data/realtorExamplePinnedLeads";
import { B2B_EXAMPLE_PINNED_LEADS } from "../data/b2bExamplePinnedLeads";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

describe("examples gallery data (2026-11-18)", () => {
  it("combines all 16 B2B and all 14 realtor pinned examples", () => {
    expect(EXAMPLES_GALLERY).toHaveLength(
      B2B_EXAMPLE_PINNED_LEADS.length + REALTOR_EXAMPLE_PINNED_LEADS.length,
    );
    expect(EXAMPLES_GALLERY.filter((e) => e.kind === "b2b")).toHaveLength(16);
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

describe("examples gallery placement (2026-11-18)", () => {
  it("the homepage gallery replaces the DemoDifferentiator slot", () => {
    const index = read("pages/Index.tsx");
    expect(index).toContain("<ExamplesGallerySection />");
    expect(index).not.toContain("DemoDifferentiator");
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
    expect(section).toContain("data-examples-gallery-scroll");
    // Bounded scroll frame on sm+, natural flow on phones.
    expect(section).toContain("sm:max-h-[528px]");
    expect(section).toContain("sm:overflow-y-auto");
    expect(section).toContain("lg:grid-cols-3");
    expect(section).toContain("sm:grid-cols-2");
  });
});
