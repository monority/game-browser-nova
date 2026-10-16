import { expect, test } from "@playwright/test";
import { pause } from "./helpers.js";

test.describe("NOVA settings", () => {
  test("speed and overlay preferences persist across reload", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // set non-default preferences through the real UI handlers
    await page.locator("button[data-action='speed-4x']").click();
    await page.locator("button[data-action='overlay-staffing']").click();
    await expect(page.locator("button[data-action='speed-4x']")).toHaveAttribute(
      "data-active",
      "true",
    );

    await page.reload();
    await expect(page.locator("button[data-action='speed-4x']")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.locator("button[data-action='overlay-staffing']")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("corrupt preferences fall back to defaults on reload", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    await page.locator("button[data-action='speed-4x']").click();
    await page.evaluate(() => localStorage.setItem("nova-prefs", "not-json{"));

    await page.reload();
    // defaults restore to a fresh-boot look: no non-default markers
    await expect(page.locator("button[data-action='speed-4x']")).not.toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.locator("button[data-action='overlay-staffing']")).not.toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("reset saved colony requires confirmation and reports status", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    await page.evaluate(() => localStorage.setItem("dummy-game", "x"));
    await page.locator("button[data-action='save']").click();

    const reset = page.locator("button[data-action='reset-save']");
    const hasSave = () =>
      page.evaluate(() => localStorage.getItem("nova-save") !== null);

    // first click only arms: label changes, slot untouched
    await reset.click();
    await expect(reset).toContainText("Confirm reset?");
    expect(await hasSave()).toBe(true);

    // second click deletes: status, slot gone, other keys intact
    await reset.click();
    await expect(reset).toContainText("Reset saved colony");
    await expect(page.locator(".nova-status")).toContainText("Save slot cleared.");
    expect(await hasSave()).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("dummy-game"))).toBe("x");

    // loading now reports the empty slot
    await page.locator("button[data-action='load']").click();
    await expect(page.locator(".nova-status")).toContainText("No saved colony found.");
  });

  test("reset on an empty slot reports empty, active game untouched", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    const popBefore = await page.evaluate(() => window.__nova!.getState().population);

    const reset = page.locator("button[data-action='reset-save']");
    await reset.click();
    await reset.click();
    await expect(page.locator(".nova-status")).toContainText("No saved colony found.");

    const after = await page.evaluate(() => ({
      population: window.__nova!.getState().population,
      tick: window.__nova!.getState().tick,
    }));
    expect(after.population).toBe(popBefore);
    expect(after.tick).toBeGreaterThanOrEqual(0);
  });
});
