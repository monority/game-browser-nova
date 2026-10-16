import { expect, test } from "@playwright/test";
import { nova, pause, waitForTick } from "./helpers.js";

test.describe("NOVA smoke", () => {
  test("boots, renders the 3D scene and advances the simulation", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/");
    await expect(page.locator("#app canvas")).toBeVisible();
    await expect(page.locator("#stats")).toBeVisible();
    await expect(page.locator("#ui button[data-build-type='residence']")).toBeVisible();

    await waitForTick(page, 3);
    await pause(page);

    const handle = await nova(page);
    const state = await page.evaluate(() =>
      window.__nova!.getState(),
    );
    void handle;
    expect(state.tick).toBeGreaterThanOrEqual(3);

    // day-0 invariants: D2 colony present, Foundation surplus flowing, no errors
    expect(state.buildings["colony-center"]).toBeDefined();
    expect(state.population).toBe(10);
    expect(Object.values(state.buildings).filter((b) => b.type === "residence").length).toBe(10);
    expect(state.resources.money).toBeGreaterThan(100); // 10 taxes + commerce beat upkeep
    expect(state.resources.food).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
