import { SEO_ROUTES } from "../../scripts/seo-routes.mjs";

export interface SeoRouteHead {
  path: string;
  canonical: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  heading: string;
  summary: string[];
  /** Keyword Q&A set for this route (visible section + fallback + FAQPage
   * schema all carry this same wording); empty for routes without one. */
  faq: { q: string; a: string }[];
}

// Typed view over scripts/seo-routes.mjs — the single source of truth shared
// with the postbuild static prerender (scripts/prerender-seo.mjs). The .mjs
// module is dependency-free plain JS so node can import it at build time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SEO_PAGE_HEADS: SeoRouteHead[] = (SEO_ROUTES as any[]).map((r) => ({
  path: r.path,
  canonical: r.canonical,
  title: r.title,
  description: r.description,
  ogTitle: r.ogTitle,
  ogDescription: r.ogDescription,
  heading: r.heading,
  summary: r.summary,
  faq: r.faq ?? [],
}));

export function seoHeadForPath(pathname: string): SeoRouteHead | null {
  return SEO_PAGE_HEADS.find((r) => r.path === pathname) || null;
}

function setMeta(selector: string, attr: "content", value: string, createAttrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    for (const [k, v] of Object.entries(createAttrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/**
 * Apply a route's head to the live document: title, meta description,
 * canonical, og:url/title/description and twitter:title/description.
 * Mirrors exactly what the static prerender writes for the same route, so
 * JS visitors and JS-running scrapers see the same head as no-JS crawlers.
 */
export function applySeoHead(route: SeoRouteHead): void {
  document.title = route.title;
  setMeta('meta[name="description"]', "content", route.description, { name: "description" });
  setMeta('meta[property="og:title"]', "content", route.ogTitle, { property: "og:title" });
  setMeta('meta[property="og:description"]', "content", route.ogDescription, { property: "og:description" });
  setMeta('meta[property="og:url"]', "content", route.canonical, { property: "og:url" });
  setMeta('meta[name="twitter:title"]', "content", route.ogTitle, { name: "twitter:title" });
  setMeta('meta[name="twitter:description"]', "content", route.ogDescription, { name: "twitter:description" });
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", route.canonical);
}
