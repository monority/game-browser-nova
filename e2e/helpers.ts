import { expect, type Page } from "@playwright/test";

/** Test helpers for the NOVA browser surface. */

export interface NovaHandle {
  getState(): {
    tick: number;
    population: number;
    resources: Record<string, number>;
    buildings: Record<string, { id: string; type: string; status: string; x: number; y: number; staffed: boolean }>;
  };
  stats(): {
    tick: number;
    population: number;
    housingCapacity: number;
    resources: Record<string, number>;
    revenuePerTick: number;
    maintenancePerTick: number;
    netMoneyPerTick: number;
  };
}

export async function nova(page: Page): Promise<NovaHandle> {
  return page.evaluate(() => {
    const handle = (window as unknown as { __nova: NovaHandle }).__nova;
    if (!handle) throw new Error("__nova missing");
    return handle;
  });
}

/** Wait until the simulation tick reaches at least `tick`. */
export async function waitForTick(page: Page, tick: number): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as unknown as { __nova: NovaHandle }).__nova.getState().tick),
      { timeout: 30_000, intervals: [250] },
    )
    .toBeGreaterThanOrEqual(tick);
}

export async function pause(page: Page): Promise<void> {
  await page.getByRole("button", { name: "pause", exact: true }).click();
}

/** The stats panel as readable text (UI-contract assertions). */
export async function statsText(page: Page): Promise<string> {
  return page.locator("#stats").innerText();
}
