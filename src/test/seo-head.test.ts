// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Importing the .mjs module directly keeps the test pinned to the exact data
// + transforms the postbuild prerender ships (no copied fixtures).
import { SEO_ROUTES, buildRouteHtml } from "../../scripts/seo-routes.mjs";
import { SEO_PAGE_HEADS, seoHeadForPath } from "../lib/seoRoutes";
import { REALTOR_VERTICAL } from "../data/agentVerticals";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const enLocale = JSON.parse(readFileSync(new URL("../i18n/locales/en.json", import.meta.url), "utf8"));
const esLocale = JSON.parse(readFileSync(new URL("../i18n/locales/es.json", import.meta.url), "utf8"));
const ptLocale = JSON.parse(readFileSync(new URL("../i18n/locales/pt-BR.json", import.meta.url), "utf8"));

interface RouteHead {
  path: string;
  canonical: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  heading: string;
  summary: string[];
  faq?: { q: string; a: string }[];
}
const routes = SEO_ROUTES as RouteHead[];
const byPath = (p: string) => routes.find((r) => r.path === p)!;

const headOf = (html: string) => html.slice(0, html.indexOf("</head>"));
const canonicalOf = (html: string) => html.match(/<link rel="canonical" href="([^"]*)">/)?.[1];
const titleOf = (html: string) => html.match(/<title>([^<]*)<\/title>/)?.[1];
const metaOf = (html: string, attr: string, name: string) =>
  html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`))?.[1];

describe("SEO route data (scripts/seo-routes.mjs — prerender + client source of truth)", () => {
  it("covers exactly the four sitemap routes", () => {
    expect(routes.map((r) => r.path)).toEqual(["/", "/demo", "/book", "/agents/realtors"]);
    // The client mirror must carry the same routes (both read the same file).
    expect(SEO_PAGE_HEADS.map((r) => r.path)).toEqual(routes.map((r) => r.path));
    for (const r of routes) expect(seoHeadForPath(r.path)?.canonical).toBe(r.canonical);
    expect(seoHeadForPath("/dashboard")).toBeNull();
  });

  it("every route canonical is self-referencing (never another route's URL)", () => {
    for (const r of routes) {
      expect(r.canonical).toBe(`https://aihiddenleads.com${r.path === "/" ? "/" : r.path}`);
    }
    // The sub-page bug this fixes: their canonicals pointed at the homepage.
    for (const r of routes.filter((x) => x.path !== "/")) {
      expect(r.canonical).not.toBe("https://aihiddenleads.com/");
    }
  });

  it("pins the exact per-route title / description / canonical", () => {
    expect(byPath("/")).toMatchObject({
      canonical: "https://aihiddenleads.com/",
      title: "AI Hidden Leads | AI Voice Agents, B2B Leads & Local SEO",
      description:
        "Grow your business with 24/7 AI voice agents, website chat and qualified B2B prospects delivered weekly. Explore local SEO and Google Maps Boost services.",
    });
    expect(byPath("/demo")).toMatchObject({
      canonical: "https://aihiddenleads.com/demo",
      title: "Live Demo | See Aspen Work on Your Own Website — AI Hidden Leads",
      description:
        "Enter your website and watch Aspen — our AI voice agent with a live video avatar — demo your business in about 2 minutes. Free, no signup needed to look.",
    });
    expect(byPath("/book")).toMatchObject({
      canonical: "https://aihiddenleads.com/book",
      title: "Book a Call | AI Hidden Leads",
      description:
        "Book a free 30-minute implementation call with the AiHiddenLeads team — weekdays 8 AM–6 PM Eastern, most calls wrap up in 15–20 minutes.",
    });
    expect(byPath("/agents/realtors")).toMatchObject({
      canonical: "https://aihiddenleads.com/agents/realtors",
      title: "AI Receptionist for Real Estate Agents | AI Hidden Leads",
      description:
        "Never miss a buyer or seller call again — even at a showing or closing. Aspen, your AI voice receptionist, answers 24/7 from $99/mo with 400 minutes included.",
    });
  });
});

describe("static prerender output (buildRouteHtml over index.html)", () => {
  it("homepage input keeps its own head and canonical", () => {
    const head = headOf(indexHtml);
    expect(titleOf(head)).toBe(byPath("/").title.replace(/&/g, "&amp;"));
    expect(canonicalOf(head)).toBe("https://aihiddenleads.com/");
    expect(metaOf(head, "name", "description")).toBe(byPath("/").description);
  });

  for (const path of ["/demo", "/book", "/agents/realtors"]) {
    it(`${path} serves its own title, description, canonical, OG tags and summary`, () => {
      const route = byPath(path);
      const html = buildRouteHtml(indexHtml, route) as string;
      const head = headOf(html);
      expect(titleOf(head)).toBe(route.title.replace(/&/g, "&amp;"));
      expect(metaOf(head, "name", "description")).toBe(route.description.replace(/&/g, "&amp;"));
      expect(canonicalOf(head)).toBe(route.canonical);
      expect(metaOf(head, "property", "og:url")).toBe(route.canonical);
      expect(metaOf(head, "property", "og:title")).toBe(route.ogTitle.replace(/&/g, "&amp;"));
      expect(metaOf(head, "property", "og:description")).toBe(route.ogDescription.replace(/&/g, "&amp;"));
      expect(metaOf(head, "name", "twitter:title")).toBe(route.ogTitle.replace(/&/g, "&amp;"));
      // Route-specific no-JS summary replaced the homepage fallback, and the
      // app bundle + startup shell survive intact.
      expect(html).toContain(`<h1>${route.heading}</h1>`);
      expect(html).toContain('<div id="startup-status"');
      expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
      expect(html).not.toContain("Try your website with Aspen</h2>");
    });
  }

  it("no route's generated canonical points at another route", () => {
    const canonicals = routes.map((r) => canonicalOf(buildRouteHtml(indexHtml, r) as string));
    expect(new Set(canonicals).size).toBe(routes.length);
    routes.forEach((r, i) => expect(canonicals[i]).toBe(r.canonical));
  });
});

describe("homepage JSON-LD (index.html)", () => {
  const block = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const ld = JSON.parse(block || "{}");

  it("parses and identifies the business", () => {
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld.name).toBe("AI Hidden Leads");
    expect(ld.url).toBe("https://aihiddenleads.com/");
    expect(ld.hasOfferCatalog).toBeTruthy();
  });

  it("carries the verified contact + area facts", () => {
    expect(ld.telephone).toBe("+1-877-862-4949");
    expect(ld.email).toBe("info@aihiddenleads.com");
    expect(ld.address).toMatchObject({
      "@type": "PostalAddress",
      addressLocality: "Fort Lauderdale",
      addressRegion: "FL",
      addressCountry: "US",
    });
    expect(ld.openingHoursSpecification).toMatchObject({ opens: "00:00", closes: "23:59" });
    expect(ld.openingHoursSpecification.dayOfWeek).toHaveLength(7);
  });

  it("deliberately has NO street address and NO sameAs until Ron rules / profiles are published", () => {
    // GBP shows a Plantation street address; the address of record is in
    // Pompano Beach. Until Ron picks the public one, area-level only.
    expect(ld.address.streetAddress).toBeUndefined();
    expect(ld.address.postalCode).toBeUndefined();
    // sameAs takes only profile URLs the site itself publishes — today it
    // publishes none, so the field stays out rather than being invented.
    expect(ld.sameAs).toBeUndefined();
  });
});

describe("keyword Q&A (FAQPage schema + fallback + visible copy parity)", () => {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const faqBlockOf = (html: string) =>
    html.match(/<script type="application\/ld\+json" data-faq-schema>([\s\S]*?)<\/script>/)?.[1];
  const schemaItems = (html: string) => {
    const block = faqBlockOf(html);
    if (!block) return null;
    const parsed = JSON.parse(block);
    expect(parsed["@type"]).toBe("FAQPage");
    return parsed.mainEntity.map((e: { name: string; acceptedAnswer: { text: string } }) => ({
      q: e.name,
      a: e.acceptedAnswer.text,
    }));
  };
  const faqOf = (p: string) => byPath(p).faq ?? [];

  it("carries the approved question sets: 5 homepage, 3 demo, 4 realtors, none on /book", () => {
    expect(faqOf("/")).toHaveLength(5);
    expect(faqOf("/demo")).toHaveLength(3);
    expect(faqOf("/agents/realtors")).toHaveLength(4);
    expect(faqOf("/book")).toHaveLength(0);
    // The client mirror carries the same sets.
    for (const r of routes) expect(seoHeadForPath(r.path)?.faq).toEqual(faqOf(r.path));
  });

  it("pins the exact keyword questions per page", () => {
    expect(faqOf("/").map((f) => f.q)).toEqual([
      "What is the best AI receptionist for a small business?",
      "How much does an AI receptionist cost per month?",
      "Is there an AI receptionist with a video avatar?",
      "Does an AI receptionist answer calls 24/7 and book appointments?",
      "How is an AI receptionist different from an answering service?",
    ]);
    expect(faqOf("/demo").map((f) => f.q)).toEqual([
      "What happens in the free demo?",
      "How long does the demo take?",
      "Do you change or hack my website?",
    ]);
    expect(faqOf("/agents/realtors").map((f) => f.q)).toEqual([
      "How much does an AI receptionist for real estate agents cost?",
      "What happens when I'm at a showing?",
      "Do I get recordings?",
      "Can it book showings and consultations?",
    ]);
  });

  it("homepage: index.html FAQPage schema and fallback mirror the data exactly", () => {
    expect(schemaItems(indexHtml)).toEqual(faqOf("/"));
    for (const item of faqOf("/")) {
      expect(indexHtml).toContain(`<h3>${escapeHtml(item.q)}</h3>`);
      expect(indexHtml).toContain(`<p>${escapeHtml(item.a)}</p>`);
    }
  });

  for (const path of ["/demo", "/agents/realtors"]) {
    it(`${path}: prerendered schema + fallback carry the route's own Q&A, never the homepage's`, () => {
      const html = buildRouteHtml(indexHtml, byPath(path)) as string;
      expect(schemaItems(html)).toEqual(faqOf(path));
      for (const item of faqOf(path)) {
        expect(html).toContain(`<h3>${escapeHtml(item.q)}</h3>`);
        expect(html).toContain(`<p>${escapeHtml(item.a)}</p>`);
      }
      // No homepage question leaks into another route's page.
      for (const homeItem of faqOf("/")) expect(html).not.toContain(homeItem.q);
    });
  }

  it("/book: prerender strips the homepage FAQPage block and declares none of its own", () => {
    const html = buildRouteHtml(indexHtml, byPath("/book")) as string;
    expect(html).not.toContain("data-faq-schema");
    expect(html).not.toContain('"@type": "FAQPage"');
  });

  it("visible copy parity: homepage FAQ, demo Q&A and realtor FAQ show the same wording", () => {
    // Homepage: the 5 keyword items lead the visible FAQ section (en).
    expect(enLocale.faqSection.items.slice(0, 5)).toEqual(faqOf("/"));
    // /demo: the page's visible Q&A section renders tryDemo.faqItems.
    expect(enLocale.tryDemo.faqItems).toEqual(faqOf("/demo"));
    // /agents/realtors: every keyword item appears verbatim in the vertical FAQ.
    for (const item of faqOf("/agents/realtors")) {
      expect(REALTOR_VERTICAL.faq).toContainEqual(item);
    }
  });

  it("locales keep the same Q&A structure (translated, not missing)", () => {
    for (const locale of [esLocale, ptLocale]) {
      expect(locale.faqSection.items).toHaveLength(enLocale.faqSection.items.length);
      expect(locale.tryDemo.faqItems).toHaveLength(3);
      expect(locale.tryDemo.faqTitle.length).toBeGreaterThan(0);
    }
  });

  it("honesty guards: entry price is never framed as $99 + $79, and recordings are not promised", () => {
    for (const r of routes) {
      for (const item of faqOf(r.path)) {
        expect(item.a).not.toMatch(/\$\s?99\s*\+\s*\$\s?79/);
      }
    }
    const recordings = faqOf("/agents/realtors").find((f) => f.q === "Do I get recordings?");
    expect(recordings?.a).toMatch(/Not yet/);
    expect(recordings?.a).toMatch(/summary/);
    expect(recordings?.a).toMatch(/transcript/);
  });
});
