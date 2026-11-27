// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Importing the .mjs modules directly pins the tests to the exact data +
// transforms the postbuild prerender ships (no copied fixtures) — the
// same convention as seo-head.test.ts.
import { SEO_ROUTES, buildRouteHtml } from "../../scripts/seo-routes.mjs";
import { ARTICLES, articleWordCount } from "../../scripts/articles-data.mjs";
import { ARTICLES_LIST, getArticle } from "../lib/articles";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

interface ArticleRoute {
  path: string;
  canonical: string;
  heading: string;
  faq?: { q: string; a: string }[];
  article?: { datePublished: string; dateModified: string; section: string };
  articleIndex?: boolean;
}
const routes = SEO_ROUTES as ArticleRoute[];
const byPath = (p: string) => routes.find((r) => r.path === p)!;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLdOf = (html: string, attr: string) => {
  const block = html.match(new RegExp(`<script type="application/ld\\+json" ${attr}>([\\s\\S]*?)</script>`))?.[1];
  return block ? JSON.parse(block) : null;
};

describe("articles foundation (Phase 1 of the SEO program, 2026-11-23)", () => {
  it("ships exactly the commissioned articles, each in the program's length band", () => {
    // Batch 1 (2026-11-23): cost, answering-service comparison, video
    // avatar. Batch 2 (2026-11-23): hiring comparison, virtual-receptionist
    // comparison, buyer's checklist.
    expect(ARTICLES.map((a) => a.slug)).toEqual([
      "ai-receptionist-cost",
      "ai-receptionist-vs-answering-service",
      "ai-receptionist-with-video-avatar",
      "ai-receptionist-vs-hiring-a-receptionist",
      "ai-receptionist-vs-virtual-receptionist",
      "best-ai-receptionist-for-small-business",
      "aihiddenleads-vs-smith-ai",
    ]);
    for (const a of ARTICLES) {
      const words = articleWordCount(a);
      expect(words, `${a.slug} word count`).toBeGreaterThanOrEqual(900);
      expect(words, `${a.slug} word count`).toBeLessThanOrEqual(1400);
      expect(a.faq.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("registers the index and detail routes in App.tsx", () => {
    expect(appSource).toContain('path="/articles"');
    expect(appSource).toContain('path="/articles/:slug"');
  });

  it("the client mirror carries the same articles as the data module", () => {
    expect(ARTICLES_LIST.map((a) => a.slug)).toEqual(ARTICLES.map((a) => a.slug));
    for (const a of ARTICLES) {
      expect(getArticle(a.slug)?.headline).toBe(a.headline);
      expect(getArticle(a.slug)?.faq).toEqual(a.faq);
    }
    expect(getArticle("no-such-article")).toBeNull();
  });

  for (const a of ARTICLES) {
    describe(`/articles/${a.slug}`, () => {
      const route = byPath(a.path);
      const html = buildRouteHtml(indexHtml, route as never) as string;

      it("has a route whose canonical is its own URL", () => {
        expect(route).toBeTruthy();
        expect(route.canonical).toBe(`https://aihiddenleads.com${a.path}`);
      });

      it("prerenders an Article JSON-LD with the article's own facts", () => {
        const ld = jsonLdOf(html, "data-article-schema");
        expect(ld["@type"]).toBe("Article");
        expect(ld.headline).toBe(a.headline);
        expect(ld.datePublished).toBe(a.datePublished);
        expect(ld.dateModified).toBe(a.dateModified);
        expect(ld.mainEntityOfPage["@id"]).toBe(route.canonical);
        expect(ld.author.name).toBe("AI Hidden Leads");
      });

      it("carries its header image (when it has one) in the page, the fallback and the schema — and renders cleanly without one", () => {
        // The image field is OPTIONAL: the daily article cron publishes
        // pieces whose hero image has not been made yet, and those must
        // render with no broken image tag anywhere.
        if (a.image) {
          expect(a.image).toMatch(/^\/articles\/[a-z0-9-]+\.webp$/);
          expect(a.imageAlt.length).toBeGreaterThan(20);
          expect(getArticle(a.slug)?.image).toBe(a.image);
          expect(getArticle(a.slug)?.imageAlt).toBe(a.imageAlt);
          expect(html).toContain(`<img src="${a.image}" alt="${escapeHtml(a.imageAlt)}" />`);
          const ld = jsonLdOf(html, "data-article-schema");
          expect(ld.image).toBe(`https://aihiddenleads.com${a.image}`);
        } else {
          expect(html).not.toContain('src="undefined"');
          expect(html).not.toContain("<figure>");
          const ld = jsonLdOf(html, "data-article-schema");
          expect(ld.image).toBe("https://aihiddenleads.com/logo.png");
        }
      });

      it("prerenders the mid-article stat panel's two approved statistics", () => {
        expect(a.body.filter((b) => b.type === "stats")).toHaveLength(1);
        expect(html).toContain("<strong>85%</strong> of callers who hit voicemail never call back.");
        expect(html).toContain("<strong>78%</strong> of customers abandoned a business after just one unanswered call.");
      });

      it("prerenders the FAQPage schema from the same Q&A the page shows", () => {
        const ld = jsonLdOf(html, "data-faq-schema");
        expect(ld["@type"]).toBe("FAQPage");
        expect(
          ld.mainEntity.map((e: { name: string; acceptedAnswer: { text: string } }) => ({
            q: e.name,
            a: e.acceptedAnswer.text,
          })),
        ).toEqual(a.faq);
        // And the fallback prints the same questions and answers visibly.
        for (const item of a.faq) {
          expect(html).toContain(`<h3>${escapeHtml(item.q)}</h3>`);
          expect(html).toContain(`<p>${escapeHtml(item.a)}</p>`);
        }
      });

      it("prerenders the full article body — headings, lists and tables included", () => {
        for (const block of a.body) {
          if (block.type === "h2") expect(html).toContain(`<h2>${escapeHtml(block.text)}</h2>`);
          if (block.type === "table") expect(html).toContain("<table>");
          if (block.type === "list") expect(html).toContain("<li>");
        }
        // The lead paragraph (the direct answer) is in the raw HTML.
        const lead = a.body.find((b) => b.type === "lead");
        expect(lead && "text" in lead ? html.includes(escapeHtml(lead.text.slice(0, 60))) : false).toBe(true);
      });

      it("cross-links the other guides and the demo in raw HTML", () => {
        expect(html).toContain('<a href="/demo">');
        expect(html).toContain('<a href="/articles">Articles and guides</a>');
        for (const other of ARTICLES.filter((x) => x.slug !== a.slug)) {
          expect(html).toContain(`href="${other.path}"`);
        }
      });
    });
  }

  it("regression: $1xx prices survive the prerender literally (no String.replace group substitution)", () => {
    // applyRouteMain used a "$1…" string replacement until the articles:
    // "$199/mo" in route copy was rewritten to the captured <div id="root">
    // prefix + "99/mo". The cost guide is full of $1xx prices — pin them.
    const route = byPath("/articles/ai-receptionist-cost");
    const html = buildRouteHtml(indexHtml, route as never) as string;
    const main = html.slice(html.indexOf("<main>"));
    expect(main).toContain("$199/mo");
    expect(main).toContain("$149/mo");
    expect(main).not.toContain('<div id="root">');
    expect(main.match(/id="root"/g)).toBeNull();
  });

  it("/articles prerenders a crawlable card for every article, with no article/FAQ schema of its own", () => {
    const route = byPath("/articles");
    expect(route.articleIndex).toBe(true);
    const html = buildRouteHtml(indexHtml, route as never) as string;
    for (const a of ARTICLES) {
      expect(html).toContain(`<a href="${a.path}">${escapeHtml(a.headline)}</a>`);
      expect(html).toContain(escapeHtml(a.excerpt));
      // Card image only when the article has one (the field is optional).
      if (a.image) {
        expect(html).toContain(`<img src="${a.image}" alt="${escapeHtml(a.imageAlt)}" />`);
      }
    }
    expect(html).not.toContain('src="undefined"');
    expect(html).not.toContain("data-article-schema");
    expect(html).not.toContain("data-faq-schema");
  });

  it("honesty guards: no ranking promises, no page-1 claims, entry price never framed as $99 + $79", () => {
    for (const a of ARTICLES) {
      const allText = [
        a.headline,
        a.description,
        ...a.body.flatMap((b) =>
          b.type === "table" ? [...b.head, ...b.rows.flat()] : b.type === "list" ? b.items : [b.text ?? ""],
        ),
        ...a.faq.flatMap((f) => [f.q, f.a]),
      ].join("\n");
      expect(allText).not.toMatch(/page (1|one)\b/i);
      // No ranking guarantees in either direction of the sentence (the
      // honest "no specific count is guaranteed" for prospect volume is
      // the homepage's own wording and stays allowed).
      expect(allText).not.toMatch(/guarantee[^.]{0,40}(rank|page|position)/i);
      expect(allText).not.toMatch(/(rank|page)[^.]{0,24}guarantee/i);
      expect(allText).not.toMatch(/\$\s?99\s*\+\s*\$\s?79/);
      // The only performance statistics the program allows are the two
      // the homepage itself publishes.
      const percents = allText.match(/\d+(?:\.\d+)?%/g) ?? [];
      for (const p of percents) expect(["85%", "78%"]).toContain(p);
    }
  });

  it("every article states the verified plan facts ($99/mo Premium, 400 minutes)", () => {
    for (const a of ARTICLES) {
      const allText = [
        ...a.body.flatMap((b) =>
          b.type === "table" ? [...b.head, ...b.rows.flat()] : b.type === "list" ? b.items : [b.text ?? ""],
        ),
        ...a.faq.map((f) => f.a),
      ].join("\n");
      expect(allText).toContain("$99/mo");
      expect(allText).toContain("400");
    }
    // The two articles that price the avatar state the verified add-on.
    for (const slug of ["ai-receptionist-cost", "ai-receptionist-with-video-avatar"]) {
      const a = ARTICLES.find((x) => x.slug === slug)!;
      const allText = [...a.body.flatMap((b) => (b.type === "p" || b.type === "lead" ? [b.text] : [])), ...a.faq.map((f) => f.a)].join("\n");
      expect(allText).toContain("$79/mo");
    }
  });
});
