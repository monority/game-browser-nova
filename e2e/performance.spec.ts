import { expect, test } from "@playwright/test";
import { pause } from "./helpers.js";

/**
 * Tier2 rendering-efficiency regressions: panels update in place (no
 * per-tick DOM rebuild) and the renderer's mesh lifecycle stays flat.
 * Thresholds are generous — they pin the *shape* of the fix against the
 * pre-Tier2 baseline (stats ≈ 17.7, progression ≈ 11.2, controls ≈ 16.8
 * childList mutations/tick at 8x), not a micro-benchmark.
 */

test.describe("rendering efficiency (Tier2)", () => {
  test("panel DOM churn stays minimal across ticks at 8x", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page.evaluate(() => {
      const w = window as unknown as { __churn?: Record<string, number> };
      w.__churn = { stats: 0, progression: 0, controls: 0 };
      for (const id of ["stats", "progression", "controls"] as const) {
        const el = document.getElementById(id);
        if (!el) continue;
        new MutationObserver((records) => {
          for (const r of records) {
            if (r.type === "childList" && (r.addedNodes.length > 0 || r.removedNodes.length > 0)) {
              w.__churn![id] += 1;
            }
          }
        }).observe(el, { childList: true, subtree: true });
      }
    });
    await page.waitForTimeout(3000);
    const { churn, perf } = await page.evaluate(() => ({
      churn: (window as unknown as { __churn: Record<string, number> }).__churn,
      perf: window.__nova!.perf(),
    }));
    expect(perf.updateCount).toBeGreaterThan(20);
    // residual below 200→900: alert lines legitimately rewrite while their
    // numbers change (e.g. D2 storage-full transient); full rebuild was ≈1843
    expect(churn.stats).toBeLessThan(900); // pre-Tier2 ≈ 1843
    expect(churn.progression).toBeLessThan(200); // pre-Tier2 ≈ 1164
    expect(churn.controls).toBeLessThan(200); // pre-Tier2 ≈ 1746
    // D2 steady-state ≈ 628 geometries; a per-tick dispose leak explodes
    expect(perf.geometries).toBeLessThan(700);
  });

  test("stats panel updates values in place (stable node identity)", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    await page.evaluate(() => {
      const w = window as unknown as { __row0?: Element };
      w.__row0 = document.querySelector("#stats .nova-row")!;
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page.waitForTimeout(1500);
    await pause(page);
    const result = await page.evaluate(() => {
      const w = window as unknown as { __row0: Element };
      return {
        stable: w.__row0 === document.querySelector("#stats .nova-row"),
        tickText: (w.__row0 as HTMLElement).textContent,
        tick: window.__nova!.getState().tick,
      };
    });
    expect(result.stable).toBe(true);
    expect(result.tickText).toBe(`Tick${result.tick}`);
  });

  test("load cycles keep canvas and geometry counts flat", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    // helpers.nova() serializes (functions stripped) — call perf in-page
    const before = await page.evaluate(() => window.__nova!.perf().geometries);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Load", exact: true }).click();
      await expect(page.locator(".nova-status")).toHaveText("Colony loaded.");
    }
    const after = await page.evaluate(() => window.__nova!.perf().geometries);
    expect(after).toBe(before); // same state → same mesh set, no accumulation
    expect(await page.locator("canvas").count()).toBe(1); // old renderers disposed
  });
});
