import { expect, type Page } from "@playwright/test";

/** Test helpers for the NOVA browser surface. */

/**
 * E2E-local contract of the `__nova` diagnostics surface: the wire
 * subset the tests actually read. Declared global so specs use
 * `window.__nova` directly — no per-site casts.
 */
declare global {
  interface Window {
    __nova?: NovaHandle;
  }
}

export interface NovaHandle {
  getState(): {
    tick: number;
    population: number;
    age: number;
    researchedTechs: string[];
    resources: Record<string, number>;
    buildings: Record<string, { id: string; type: string; status: string; x: number; y: number; staffed: boolean; active: boolean }>;
    world: { width: number; height: number; blockedCells: Record<string, true> };
    roads: Record<string, { cells: string[] }>;
    woodDeposits: Record<string, { remaining: number; capacity: number }>;
    stoneDeposits: Record<string, { remaining: number; capacity: number }>;
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
  command(cmd: unknown): { ok: boolean; reason?: string };
  perf(): {
    drawCalls: number;
    geometries: number;
    textures: number;
    programs: number;
    triangles: number;
    updateCount: number;
    lastUpdateMs: number;
    avgUpdateMs: number;
  };
}

export async function nova(page: Page): Promise<NovaHandle> {
  return page.evaluate(() => {
    const handle = window.__nova;
    if (!handle) throw new Error("__nova missing");
    return handle;
  });
}

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

/**
 * Remove every player building and road via real commands, leaving the
 * Colony Center anchor. Isolates mechanic scenarios from the D2 colony.
 */
export async function stripToAnchor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__nova;
    if (!h) throw new Error("__nova missing");
    const s = h.getState();
    for (const id of Object.keys(s.buildings)) {
      if (id === "colony-center") continue;
      const r = h.command({ kind: "removeBuilding", id });
      if (!r.ok) throw new Error("strip failed: " + r.reason);
    }
    for (const road of Object.values(s.roads)) {
      const r = h.command({ kind: "removeRoads", cells: [...road.cells] });
      if (!r.ok) throw new Error("strip roads failed: " + r.reason);
    }
  });
}

export async function pause(page: Page): Promise<void> {
  await page.getByRole("button", { name: "pause", exact: true }).click();
}

/** The stats panel as readable text (UI-contract assertions). */
export async function statsText(page: Page): Promise<string> {
  return page.locator("#stats").innerText();
}
