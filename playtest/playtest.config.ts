import { defineConfig } from "@playwright/test";

/**
 * Agent playtest walkthroughs (Step054): the owner-requested scenarios A-D
 * executed through the real UI, producing screenshots and an observation
 * report. NOT part of the CI gate — run manually with:
 *
 *   pnpm exec playwright test -c playtest/playtest.config.ts
 *
 * Own dev server on port 5274 so an owner session on another port (e.g.
 * 5199) is never disturbed.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  timeout: 180_000,
  retries: 0,
  workers: 1,
  outputDir: "./artifacts/.test-results",
  use: {
    baseURL: "http://localhost:5274",
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: "off",
  },
  webServer: {
    command: "pnpm dev --port 5274 --strictPort",
    url: "http://localhost:5274",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
