import { PhoneMissed, UserX } from "lucide-react";

/**
 * The designed mid-article stat panel: the SEO program's two approved
 * statistics — the same numbers the homepage itself publishes (85% of
 * callers who hit voicemail never call back; 78% of customers abandoned
 * a business after just one unanswered call). Rendered by ArticleBody
 * wherever an article's body carries a { type: "stats" } block
 * (scripts/articles-data.mjs); the static prerender prints the same two
 * facts in its no-JS fallback (seoBodyHtml in scripts/seo-routes.mjs),
 * so the panel never introduces a number the crawler copy doesn't carry.
 */
const ArticleStatPanel = () => {
  return (
    <aside
      aria-label="Why an unanswered phone costs you customers"
      className="my-10 rounded-xl border border-primary/25 bg-primary/5 p-6 sm:p-8"
    >
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex items-start gap-4">
          <PhoneMissed className="mt-1 h-8 w-8 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-4xl font-bold text-foreground leading-none mb-2">85%</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              of callers who hit voicemail never call back.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <UserX className="mt-1 h-8 w-8 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-4xl font-bold text-foreground leading-none mb-2">78%</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              of customers abandoned a business after just one unanswered call.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default ArticleStatPanel;
