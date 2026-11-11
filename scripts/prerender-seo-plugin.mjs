// Vite plugin wrapper around the SEO route prerender: runs the same
// generation as scripts/prerender-seo.mjs inside ANY vite build (closeBundle
// hook), so the static per-route variants are emitted however the build is
// invoked — `npm run build`, `bun run build`, or a bare `vite build` in a
// GUI publish flow that never runs package.json's chained postbuild step.
import { generateSeoRouteFiles } from "./prerender-seo.mjs";

export default function seoPrerenderPlugin() {
  return {
    name: "seo-route-prerender",
    apply: "build",
    closeBundle() {
      generateSeoRouteFiles();
    },
  };
}
