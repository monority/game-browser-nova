import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:5273",
    headless: true,
  },
  webServer: {
    command: "pnpm dev --port 5273 --strictPort",
    url: "http://localhost:5273",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
