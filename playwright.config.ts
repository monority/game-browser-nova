import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  // The HTML report is always written (never auto-opened) so CI can upload
  // it on failure; traces/screenshots are kept for failing journeys only.
  // The JSON report is what `tools/testing/report-e2e-failures.mjs` replays into CI
  // annotations: a red step otherwise says only "exit code 1", and the failing
  // journey's name lives in an artifact that needs an authenticated download.
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: "http://localhost:5273",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Call vite through Node instead of `pnpm dev`: the dev server is a local
    // dependency, and a broken pnpm on the machine (missing shared library in a
    // container) must not be able to block every E2E run with "webServer failed
    // to start". Same command on CI, where `pnpm install` has populated
    // node_modules before this step.
    command: "node node_modules/vite/bin/vite.js --port 5273 --strictPort",
    url: "http://localhost:5273",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
