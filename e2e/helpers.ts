import { expect, type Page } from "@playwright/test";
import type { NovaHandle } from "@/app/diagnostics.js";

/** Test helpers for the NOVA browser surface. */

// `window.__nova` is declared globally by src/app/diagnostics.ts: the E2E
// specs consume the production contract instead of a drifting local copy.
export type { NovaHandle };

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
