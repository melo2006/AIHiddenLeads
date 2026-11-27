import { CITIES, cityForSlug, cityWordCount } from "../../scripts/cities-data.mjs";
import type { ArticleBlock } from "@/lib/articles";

export interface CityLocalBusiness {
  telephone: string;
  email: string;
  priceRange: string;
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    addressCountry: string;
  };
  areaServed: string[];
}

export interface City {
  slug: string;
  path: string;
  cityName: string;
  headline: string;
  seoTitle: string;
  description: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  targetKeyword: string;
  datePublished: string;
  dateModified: string;
  body: ArticleBlock[];
  faq: { q: string; a: string }[];
  /** Present only where the company has a real presence to declare
   * (see scripts/cities-data.mjs honesty rules); remotely served
   * cities carry none. */
  localBusiness?: CityLocalBusiness;
}

// Typed view over scripts/cities-data.mjs — the single source of truth
// shared with the static prerender (scripts/seo-routes.mjs builds each
// city page's head, FAQPage schema, full-body fallback and optional
// LocalBusiness schema from the same data), so the visible page can
// never drift from the schema. The .mjs module is dependency-free
// plain JS so node can import it at build time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CITIES_LIST: City[] = (CITIES as any[]).map((c) => ({
  slug: c.slug,
  path: c.path,
  cityName: c.cityName,
  headline: c.headline,
  seoTitle: c.seoTitle,
  description: c.description,
  excerpt: c.excerpt,
  image: c.image,
  imageAlt: c.imageAlt,
  targetKeyword: c.targetKeyword,
  datePublished: c.datePublished,
  dateModified: c.dateModified,
  body: c.body as ArticleBlock[],
  faq: c.faq as { q: string; a: string }[],
  localBusiness: c.localBusiness as CityLocalBusiness | undefined,
}));

export function getCity(slug: string | undefined): City | null {
  if (!slug) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = cityForSlug(slug) as any;
  return found ? CITIES_LIST.find((c) => c.slug === found.slug) ?? null : null;
}

export function cityReadingMinutes(city: City): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const words = cityWordCount(city as any) as number;
  return Math.max(1, Math.round(words / 200));
}
