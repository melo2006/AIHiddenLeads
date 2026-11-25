import {
  ARTICLES,
  articleForSlug,
  articleWordCount,
  formatArticleDate,
} from "../../scripts/articles-data.mjs";

export type ArticleBlock =
  | { type: "lead" | "p" | "h2"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

export interface Article {
  slug: string;
  path: string;
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
}

// Typed view over scripts/articles-data.mjs — the single source of truth
// shared with the static prerender (scripts/seo-routes.mjs builds each
// article's head, Article + FAQPage schema and no-JS fallback from the
// same data), so the visible page can never drift from the schema. The
// .mjs module is dependency-free plain JS so node can import it at build
// time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ARTICLES_LIST: Article[] = (ARTICLES as any[]).map((a) => ({
  slug: a.slug,
  path: a.path,
  headline: a.headline,
  seoTitle: a.seoTitle,
  description: a.description,
  excerpt: a.excerpt,
  image: a.image,
  imageAlt: a.imageAlt,
  targetKeyword: a.targetKeyword,
  datePublished: a.datePublished,
  dateModified: a.dateModified,
  body: a.body as ArticleBlock[],
  faq: a.faq as { q: string; a: string }[],
}));

export function getArticle(slug: string | undefined): Article | null {
  if (!slug) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = articleForSlug(slug) as any;
  return found ? ARTICLES_LIST.find((a) => a.slug === found.slug) ?? null : null;
}

export function articleReadingMinutes(article: Article): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const words = articleWordCount(article as any) as number;
  return Math.max(1, Math.round(words / 200));
}

export { formatArticleDate };
