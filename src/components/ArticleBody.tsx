import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ArticleBlock } from "@/lib/articles";

/**
 * Renders an article's structured body (scripts/articles-data.mjs) for the
 * React article page. The static prerender renders the SAME blocks into
 * the no-JS fallback (seoBodyHtml in scripts/seo-routes.mjs), so the
 * visible text and the crawler text are one wording. Inline links use the
 * data's [label](/path) convention and become real router links here.
 */
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!m) return <span key={`${keyPrefix}-${i}`}>{part}</span>;
    const [, label, href] = m;
    if (href.startsWith("/")) {
      return (
        <Link
          key={`${keyPrefix}-${i}`}
          to={href}
          className="text-primary underline underline-offset-4 hover:text-primary/80"
        >
          {label}
        </Link>
      );
    }
    return (
      <a
        key={`${keyPrefix}-${i}`}
        href={href}
        className="text-primary underline underline-offset-4 hover:text-primary/80"
      >
        {label}
      </a>
    );
  });
}

export default function ArticleBody({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <div>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "lead":
            return (
              <p key={i} className="text-lg sm:text-xl leading-relaxed text-foreground mb-8">
                {renderInline(block.text, `lead-${i}`)}
              </p>
            );
          case "p":
            return (
              <p key={i} className="text-muted-foreground leading-relaxed mb-5">
                {renderInline(block.text, `p-${i}`)}
              </p>
            );
          case "h2":
            return (
              <h2 key={i} className="text-2xl font-semibold text-foreground mt-10 mb-4">
                {block.text}
              </h2>
            );
          case "list":
            return (
              <ul key={i} className="list-disc pl-6 space-y-2.5 mb-6 text-muted-foreground leading-relaxed">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `li-${i}-${j}`)}</li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto mb-8 rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      {block.head.map((h, j) => (
                        <th key={j} className="text-left font-semibold text-foreground px-4 py-3 align-top">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-t border-border">
                        {row.map((cell, c) =>
                          c === 0 ? (
                            <th key={c} scope="row" className="text-left font-medium text-foreground px-4 py-3 align-top">
                              {cell}
                            </th>
                          ) : (
                            <td key={c} className="text-muted-foreground px-4 py-3 align-top">
                              {cell}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
