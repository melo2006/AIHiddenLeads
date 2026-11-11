// Postbuild step (chained from `npm run build`): emit a static HTML variant
// per public marketing route so crawlers and link unfurlers that fetch
// /demo, /book or /agents/realtors without running JavaScript get that
// route's OWN title, meta description, canonical and Open Graph tags plus a
// route-specific no-JS summary — instead of the homepage's head and a
// canonical pointing at the homepage (which told Google to ignore them).
//
// Hosting constraint (verified 2026-11-11): the app is a single-page app
// served as static files (Cloud Run / AI Studio publish of dist/) with an
// SPA fallback to dist/index.html and NO server-side rewrite configuration
// anywhere in the repo. Static hosts resolve a real file before the
// fallback, so dist/demo/index.html, dist/book/index.html and
// dist/agents/realtors/index.html are the least invasive way to give those
// exact URLs their own static head with zero new dependencies and zero
// runtime/server changes. Each variant loads the exact same built bundle —
// only the <head> fields and the hidden no-JS <main> differ.
//
// If the production host is ever found NOT to prefer real files over the
// SPA fallback, only THIS step's delivery is inert; the client-side
// usePageHead hook still keeps title/meta correct for JS visitors.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEO_ROUTES, buildRouteHtml } from "./seo-routes.mjs";

export function generateSeoRouteFiles(baseDir = join(dirname(fileURLToPath(import.meta.url)), "..")) {
  const distDir = join(baseDir, "dist");
  const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");
  let written = 0;
  for (const route of SEO_ROUTES) {
    if (route.path === "/") continue; // dist/index.html already is the homepage
    const dir = join(distDir, route.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), buildRouteHtml(indexHtml, route), "utf8");
    written += 1;
    console.log(`prerender-seo: wrote dist${route.path}/index.html (canonical ${route.canonical})`);
  }
  console.log(`prerender-seo: ${written} route variants written`);
  return written;
}

// CLI use: `node scripts/prerender-seo.mjs` (also chained in npm run build).
// When imported by the vite plugin, only the function above runs.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateSeoRouteFiles();
}
