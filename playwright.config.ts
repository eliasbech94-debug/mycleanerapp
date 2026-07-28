import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
