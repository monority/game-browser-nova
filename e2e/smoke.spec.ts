import { expect, test } from "@playwright/test";
import { pause, waitForTick } from "./helpers.js";

test.describe("NOVA smoke", () => {
  test("boots, advances, tracks resize, and carries the money-era stat surface", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/");
    const canvas = page.locator("#app canvas");
    await expect(canvas).toBeVisible();
    await expect(page.locator("#stats")).toBeVisible();
    await expect(page.locator("#ui button[data-build-type='residence']")).toBeVisible();

    await waitForTick(page, 3);
    await pause(page);

    // day-0 invariants: D2 colony present, Foundation surplus flowing, no errors
    const state = await page.evaluate(() => window.__nova!.getState());
    expect(state.tick).toBeGreaterThanOrEqual(3);
    expect(state.buildings["colony-center"]).toBeDefined();
    expect(state.population).toBe(10);
    expect(Object.values(state.buildings).filter((b) => b.type === "residence")).toHaveLength(10);
    expect(state.resources.money).toBeGreaterThan(100); // 10 taxes beat upkeep
    expect(state.resources.food).toBeGreaterThan(0);

    // Step065: the market left with the money trade — no palette entry at any age
    await expect(page.locator("button[data-build-type='market']")).toHaveCount(0);

    // the stat surface names the money model and no pre-money field resurrects
    const text = await page.locator("#stats").innerText();
    for (const label of [
      "Money",
      "Revenue/tick",
      "Maintenance/tick",
      "Net money/tick",
      "Planks",
    ]) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain("storageCapacity");
    expect(text).not.toContain("netMaterial");
    // Step057: the workforce ratio is a permanent stat row, never an alert
    expect(text).toMatch(/\d+ \/ \d+ staffed/);
    expect(text).not.toContain("Workforce:");

    // the renderer follows its container through a real resize
    for (const size of [
      { width: 900, height: 600 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(
          async () => {
            const box = await canvas.boundingBox();
            if (!box) return Number.POSITIVE_INFINITY;
            return Math.abs(box.width - size.width) + Math.abs(box.height - size.height);
          },
          { timeout: 5_000 },
        )
        .toBeLessThanOrEqual(1);
    }

    expect(errors).toEqual([]);
  });
});
