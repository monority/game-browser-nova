import { expect, type Page } from "@playwright/test";

/**
 * Test helpers for the NOVA browser surface.
 *
 * `window.__nova` is declared globally by src/app/diagnostics.ts: the specs
 * read the production handle directly instead of a drifting local copy.
 */

/** Wait until the simulation tick reaches at least `tick`. */
export async function waitForTick(page: Page, tick: number): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__nova?.getState().tick),
      { timeout: 30_000, intervals: [250] },
    )
    .toBeGreaterThanOrEqual(tick);
}

export async function pause(page: Page): Promise<void> {
  await page.getByRole("button", { name: "pause", exact: true }).click();
}

