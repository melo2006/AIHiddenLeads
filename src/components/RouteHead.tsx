import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applySeoHead, seoHeadForPath } from "@/lib/seoRoutes";

/**
 * Keeps the document head in sync with the route during SPA navigation for
 * the public marketing routes that have a defined SEO head (/, /demo,
 * /book, /agents/realtors — see scripts/seo-routes.mjs, the same data the
 * static prerender uses). Routes without a defined head (app, checkout,
 * per-prospect demos…) are left untouched so pages that manage their own
 * title (ServiceDetail, SharedDemo) keep working exactly as before.
 *
 * Render inside <BrowserRouter>; the component itself renders nothing.
 */
/**
 * Runs inside <BrowserRouter> in App: tracks the current pathname and keeps
 * the document head in sync with the route (title/meta/canonical via
 * RouteHead) for the public marketing routes that have a defined SEO head.
 */
export function LocationHead() {
  const { pathname } = useLocation();
  return <RouteHead pathname={pathname} />;
}

export default function RouteHead({ pathname }: { pathname: string }) {
  useEffect(() => {
    const head = seoHeadForPath(pathname);
    if (head) applySeoHead(head);
  }, [pathname]);
  return null;
}
