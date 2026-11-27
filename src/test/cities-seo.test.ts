// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Importing the .mjs modules directly pins the tests to the exact data +
// transforms the postbuild prerender ships (no copied fixtures) — the
// same convention as articles-seo.test.ts.
import { SEO_ROUTES, buildRouteHtml } from "../../scripts/seo-routes.mjs";
import { CITIES, cityWordCount } from "../../scripts/cities-data.mjs";
import { CITIES_LIST, getCity } from "../lib/cities";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

interface CityRoute {
  path: string;
  canonical: string;
  heading: string;
  faq?: { q: string; a: string }[];
  localBusiness?: unknown;
}
const routes = SEO_ROUTES as CityRoute[];
const byPath = (p: string) => routes.find((r) => r.path === p)!;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLdOf = (html: string, attr: string) => {
  const block = html.match(new RegExp(`<script type="application/ld\\+json" ${attr}>([\\s\\S]*?)</script>`))?.[1];
  return block ? JSON.parse(block) : null;
};
const allTextOf = (c: (typeof CITIES)[number]) =>
  [
    c.headline,
    c.description,
    ...c.body.flatMap((b) =>
      b.type === "table" ? [...b.head, ...b.rows.flat()] : b.type === "list" ? b.items : [b.text ?? ""],
    ),
    ...c.faq.flatMap((f) => [f.q, f.a]),
  ].join("\n");

describe("city landing pages (SEO program, 2026-11-27)", () => {
  it("ships exactly the commissioned cities, each in the program's length band", () => {
    // Ron's order, 2026-11-27: Fort Lauderdale first, then Dallas.
    expect(CITIES.map((c) => c.slug)).toEqual(["fort-lauderdale", "dallas"]);
    for (const c of CITIES) {
      const words = cityWordCount(c);
      expect(words, `${c.slug} word count`).toBeGreaterThanOrEqual(900);
      expect(words, `${c.slug} word count`).toBeLessThanOrEqual(1200);
      expect(c.faq.length).toBeGreaterThanOrEqual(4);
      expect(c.body.filter((b) => b.type === "stats")).toHaveLength(1);
    }
  });

  it("registers the shared city route in App.tsx", () => {
    expect(appSource).toContain('path="/ai-receptionist/:city"');
  });

  it("the client mirror carries the same cities as the data module", () => {
    expect(CITIES_LIST.map((c) => c.slug)).toEqual(CITIES.map((c) => c.slug));
    for (const c of CITIES) {
      expect(getCity(c.slug)?.headline).toBe(c.headline);
      expect(getCity(c.slug)?.faq).toEqual(c.faq);
      expect(getCity(c.slug)?.image).toBe(c.image);
    }
    expect(getCity("no-such-city")).toBeNull();
  });

  it("the two pages are substantively different — no shared body block or FAQ item", () => {
    // A name-swapped duplicate is a failed city page: no paragraph,
    // list, list item or FAQ entry of one page may appear in the other.
    const [a, b] = CITIES;
    const bText = allTextOf(b);
    const aText = allTextOf(a);
    const blocksOf = (c: (typeof CITIES)[number]) => [
      ...c.body.flatMap((x) => (x.type === "list" ? x.items : x.type === "stats" || x.type === "table" ? [] : [x.text ?? ""])),
      ...c.faq.flatMap((f) => [f.q, f.a]),
    ];
    for (const t of blocksOf(a)) expect(bText).not.toContain(t);
    for (const t of blocksOf(b)) expect(aText).not.toContain(t);
    expect(a.headline).not.toBe(b.headline);
    expect(a.description).not.toBe(b.description);
  });

  for (const c of CITIES) {
    describe(`/ai-receptionist/${c.slug}`, () => {
      const route = byPath(c.path);
      const html = buildRouteHtml(indexHtml, route as never) as string;

      it("has a route whose canonical is its own URL, with its own title", () => {
        expect(route).toBeTruthy();
        expect(route.canonical).toBe(`https://aihiddenleads.com${c.path}`);
        expect(html).toContain(`<title>${escapeHtml(c.seoTitle)}</title>`);
        expect(html).toContain(`<h1>${escapeHtml(c.headline)}</h1>`);
      });

      it("carries its hero image in the fallback, on the /cities/<slug>.webp path", () => {
        expect(c.image).toBe(`/cities/${c.slug}.webp`);
        expect(c.imageAlt.length).toBeGreaterThan(20);
        expect(html).toContain(`<img src="${c.image}" alt="${escapeHtml(c.imageAlt)}" />`);
      });

      it("prerenders the FAQPage schema from the same Q&A the page shows", () => {
        const ld = jsonLdOf(html, "data-faq-schema");
        expect(ld["@type"]).toBe("FAQPage");
        expect(
          ld.mainEntity.map((e: { name: string; acceptedAnswer: { text: string } }) => ({
            q: e.name,
            a: e.acceptedAnswer.text,
          })),
        ).toEqual(c.faq);
        for (const item of c.faq) {
          expect(html).toContain(`<h3>${escapeHtml(item.q)}</h3>`);
          expect(html).toContain(`<p>${escapeHtml(item.a)}</p>`);
        }
      });

      it("prerenders the full body — lead, headings, list and the stat panel", () => {
        for (const block of c.body) {
          if (block.type === "h2") expect(html).toContain(`<h2>${escapeHtml(block.text)}</h2>`);
          if (block.type === "list") expect(html).toContain("<li>");
        }
        const lead = c.body.find((b) => b.type === "lead");
        expect(lead && "text" in lead ? html.includes(escapeHtml(lead.text.slice(0, 60))) : false).toBe(true);
        expect(html).toContain("<strong>85%</strong> of callers who hit voicemail never call back.");
        expect(html).toContain("<strong>78%</strong> of customers abandoned a business after just one unanswered call.");
      });

      it("cross-links the cost guide, the answering-service comparison, /plans and /demo in raw HTML", () => {
        expect(html).toContain('href="/articles/ai-receptionist-cost"');
        expect(html).toContain('href="/articles/ai-receptionist-vs-answering-service"');
        expect(html).toContain('href="/plans"');
        expect(html).toContain('<a href="/demo">');
      });

      it("states the verified plan facts ($99/mo Premium, 400 minutes)", () => {
        const text = allTextOf(c);
        expect(text).toContain("$99/mo");
        expect(text).toContain("400");
        expect(text).toContain("$199/mo");
        expect(text).toContain("$79/mo");
      });
    });
  }

  it("Fort Lauderdale declares a page-level LocalBusiness with the real Pompano Beach address and Fort Lauderdale/Broward areaServed", () => {
    const c = CITIES.find((x) => x.slug === "fort-lauderdale")!;
    const html = buildRouteHtml(indexHtml, byPath(c.path) as never) as string;
    const ld = jsonLdOf(html, "data-localbusiness-schema");
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld["@id"]).toBe("https://aihiddenleads.com/ai-receptionist/fort-lauderdale#business");
    expect(ld.telephone).toBe("+1-877-862-4949");
    expect(ld.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "1401 S Ocean Blvd",
      addressLocality: "Pompano Beach",
      addressRegion: "FL",
      addressCountry: "US",
    });
    // No ZIP: none exists anywhere in this codebase for this address.
    expect(ld.address.postalCode).toBeUndefined();
    expect(ld.areaServed).toContain("Fort Lauderdale");
    expect(ld.areaServed).toContain("Broward County");
    // The page copy itself presents the base honestly.
    expect(allTextOf(c)).toContain("based up the coast in Pompano Beach");
  });

  it("Dallas declares NO page-level LocalBusiness and never invents a Dallas address or local number", () => {
    const c = CITIES.find((x) => x.slug === "dallas")!;
    expect(c.localBusiness).toBeUndefined();
    const html = buildRouteHtml(indexHtml, byPath(c.path) as never) as string;
    expect(html).not.toContain("data-localbusiness-schema");
    const text = allTextOf(c);
    // The honesty is on the page, in words: no Dallas office, remote setup.
    expect(text).toContain("no Dallas office");
    expect(text).toContain("served remotely");
    // No Dallas street address pattern and no Dallas-area-code phone
    // number presented as ours (area codes appear only as the caller's
    // own number the customer keeps).
    expect(text).not.toMatch(/\b\d{3,5}\s+(N|S|E|W|North|South|East|West)?\s?[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive)\b/);
    expect(text).not.toMatch(/\b(214|469|972|945|817)-\d{3}-\d{4}\b/);
    expect(text).toContain("1-877-862-4949");
  });

  it("honesty guards: no ranking promises, no page-1 claims, entry price never framed as $99 + $79, only the two approved statistics", () => {
    for (const c of CITIES) {
      const text = allTextOf(c);
      expect(text).not.toMatch(/page (1|one)\b/i);
      expect(text).not.toMatch(/guarantee[^.]{0,40}(rank|page|position)/i);
      expect(text).not.toMatch(/(rank|page)[^.]{0,24}guarantee/i);
      expect(text).not.toMatch(/\$\s?99\s*\+\s*\$\s?79/);
      const percents = text.match(/\d+(?:\.\d+)?%/g) ?? [];
      for (const p of percents) expect(["85%", "78%"]).toContain(p);
    }
  });
});
