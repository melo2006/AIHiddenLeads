import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import Footer from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { ARTICLES_LIST, articleReadingMinutes, formatArticleDate } from "@/lib/articles";
import { seoHeadForPath } from "@/lib/seoRoutes";

/**
 * /articles — the guides hub. Intro copy comes from the route's SEO data
 * (scripts/seo-routes.mjs), the same wording the static prerender prints
 * in the no-JS fallback; the cards come from scripts/articles-data.mjs,
 * the same data the fallback lists and the article pages render.
 */
const Articles = () => {
  const head = seoHeadForPath("/articles");

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main className="container mx-auto px-4 sm:px-6 py-10 sm:py-14 max-w-4xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-4">
          {head?.heading ?? "Articles & guides"}
        </h1>
        {(head?.summary ?? []).map((p) => (
          <p key={p.slice(0, 24)} className="text-lg text-muted-foreground leading-relaxed mb-4 max-w-3xl">
            {p}
          </p>
        ))}

        <div className="grid gap-5 sm:grid-cols-2 mt-10">
          {ARTICLES_LIST.map((article) => (
            <Link
              key={article.slug}
              to={article.path}
              className="flex flex-col rounded-xl border border-border p-6 hover:border-primary/40 transition-colors"
            >
              <span className="text-xs text-muted-foreground mb-3">
                {formatArticleDate(article.datePublished)} · {articleReadingMinutes(article)} min read
              </span>
              <span className="text-xl font-semibold text-foreground leading-snug mb-2">{article.headline}</span>
              <span className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">{article.excerpt}</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Read the guide
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          ))}
        </div>

        <section className="mt-14 rounded-xl border border-primary/25 bg-primary/5 p-6 sm:p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-3">Rather watch than read?</h2>
          <p className="text-muted-foreground leading-relaxed mb-6 max-w-xl mx-auto">
            See Aspen — our AI receptionist with a live video avatar — work on a preview of your own website in
            about 2 minutes. Free, and nothing is installed.
          </p>
          <Link to="/demo">
            <Button size="lg" className="gap-2">
              Try the free live demo
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Articles;
