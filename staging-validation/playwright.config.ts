import { defineConfig } from "@playwright/test";
import "dotenv/config";

const runId = process.env.RC2_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");

export default defineConfig({
  testDir: "./scenarios",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: `./evidence/${runId}/ui/report.json` }], ["html", { outputFolder: `./evidence/${runId}/ui/html`, open: "never" }]],
  use: {
    baseURL: process.env.STAGING_APP_URL,
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  outputDir: `./evidence/${runId}/ui/artifacts`,
});
