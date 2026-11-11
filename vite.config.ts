import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// SEO route prerender (get-found fixes, 2026-11-11): emit a static HTML
// variant per public marketing route — see scripts/prerender-seo.mjs. Runs
// inside every vite build so no publish path (Studio GUI included, which
// never executes package.json's chained postbuild step) can skip it.
// eslint-disable-next-line import/no-relative-packages
import seoPrerender from "./scripts/prerender-seo-plugin.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), seoPrerender()].filter(Boolean),
  // Prebundle transcript dependencies before serving the first page, rather
  // than invalidating already-open previews when the voice widget loads.
  optimizeDeps: {
    include: ["streamdown", "@streamdown/cjk", "@streamdown/code", "@streamdown/math", "@streamdown/mermaid"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
