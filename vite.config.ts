import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    /**
     * No `manualChunks` on purpose.
     *
     * Route-level splitting (see src/routes/groups) already keeps feature code
     * out of the entry bundle, and Rollup's automatic splitting follows those
     * dynamic-import boundaries correctly — Mapbox, charts and the admin
     * surfaces all land in their own lazy chunks without any hand-tuning.
     *
     * Two hand-rolled variants were tried and reverted:
     *  - Splitting React-dependent libs (react-dom, @supabase, i18next,
     *    framer-motion) into vendor chunks produced cyclic chunk imports whose
     *    execution order left React undefined at init, white-screening the
     *    production build with "Cannot read properties of undefined (reading
     *    'createContext')". The dev server never shows this — it doesn't bundle.
     *  - A catch-all "vendor" chunk hoisted lazy-route libraries back into the
     *    entry and cost +88 kB gzip on initial load.
     *
     * Revisit only with a production-build browser check in the loop.
     */

  },
}));

