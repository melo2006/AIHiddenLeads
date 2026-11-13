// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  B2B_EXAMPLE_PACKS as CLIENT_PACKS,
  examplePackForSiteUrl as clientPackFor,
  topExampleServices as clientTop,
} from "../data/b2bExampleServices";
import {
  B2B_EXAMPLE_PACKS as SERVER_PACKS,
  buildExampleServicesLayer,
  examplePackBySlug,
  examplePackForSiteUrl,
  normalizeExampleSiteUrl,
  topExampleServices,
} from "../../supabase/functions/_shared/b2b-example-services";

const EXPECTED_NICHE_COUNTS: Record<string, number> = {
  dentist: 1,
  roofer: 1,
  hvac: 1,
  lawyer: 1,
  plumber: 1,
  pavers: 1,
  manufacturer: 2,
  marine: 2,
  "auto-repair": 2,
  "b2b-services": 2,
  "field-service": 2,
};

describe("b2b example services packs", () => {
  it("carries exactly 16 packs in Ron's composition (6 major singles + 5 core niches x2)", () => {
    expect(CLIENT_PACKS).toHaveLength(16);
    const counts: Record<string, number> = {};
    for (const pack of CLIENT_PACKS) counts[pack.niche] = (counts[pack.niche] ?? 0) + 1;
    expect(counts).toEqual(EXPECTED_NICHE_COUNTS);
    const slugs = CLIENT_PACKS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(16);
    const urls = CLIENT_PACKS.map((p) => normalizeExampleSiteUrl(p.url));
    expect(new Set(urls).size).toBe(16);
  });

  it("keeps the client and server copies in lockstep", () => {
    expect(SERVER_PACKS).toEqual(CLIENT_PACKS);
  });

  it("every pack has a real services set with descriptors and honest source marks", () => {
    for (const pack of CLIENT_PACKS) {
      expect(pack.services.length, pack.slug).toBeGreaterThanOrEqual(8);
      const siteCount = pack.services.filter((s) => s.source === "site").length;
      expect(siteCount, pack.slug).toBeGreaterThanOrEqual(Math.ceil(pack.services.length / 2));
      for (const service of pack.services) {
        expect(service.name.trim(), pack.slug).not.toBe("");
        expect(service.descriptor.trim(), pack.slug).not.toBe("");
        expect(["site", "sample"]).toContain(service.source);
      }
      expect(pack.businessName.trim()).not.toBe("");
      expect(pack.city.trim()).not.toBe("");
      expect(pack.state.trim()).not.toBe("");
    }
  });

  it("resolves each example URL to its pack (www-insensitive) and misses cleanly", () => {
    for (const pack of CLIENT_PACKS) {
      expect(examplePackForSiteUrl(pack.url)?.slug).toBe(pack.slug);
      expect(clientPackFor(pack.url)?.slug).toBe(pack.slug);
      const bare = pack.url.replace("://www.", "://");
      const withWww = pack.url.includes("://www.")
        ? pack.url
        : pack.url.replace("://", "://www.");
      expect(examplePackForSiteUrl(bare)?.slug).toBe(pack.slug);
      expect(examplePackForSiteUrl(withWww)?.slug).toBe(pack.slug);
      expect(examplePackBySlug(pack.slug)?.url).toBe(pack.url);
    }
    expect(examplePackForSiteUrl("https://not-an-example.example/")).toBeNull();
    expect(examplePackForSiteUrl("not a url")).toBeNull();
    expect(examplePackBySlug("nope")).toBeNull();
  });

  it("names the business's own services first", () => {
    for (const pack of CLIENT_PACKS) {
      const top = topExampleServices(pack, 3);
      expect(top).toHaveLength(3);
      for (const service of top) expect(service.source).toBe("site");
      expect(clientTop(pack, 3)).toEqual(top);
    }
  });

  it("builds a services layer naming the business and its real services", () => {
    for (const pack of SERVER_PACKS) {
      const layer = buildExampleServicesLayer(pack);
      expect(layer).toContain(pack.businessName);
      expect(layer).toContain(pack.services[0].name);
      expect(layer).toContain("never invent a service");
    }
  });
});
