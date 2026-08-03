import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Render-heavy suites (sidebar, route smoke tests) can exceed the 5s
    // default purely from worker contention when the full suite runs in
    // parallel, producing flaky timeouts. Individually they finish in <1s.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
