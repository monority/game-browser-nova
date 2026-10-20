import { expect, test } from "@playwright/test";
import { pause, stripToAnchor } from "./helpers.js";

/**
 * Tier2 accessibility regressions: visible keyboard focus, polite live
 * regions for command outcomes and alert-kind changes, Space on focused
 * buttons, and the new overlay toggles (keyboard + no state mutation).
 */

test.describe("accessibility (Tier2)", () => {
  test("keyboard focus gets a visible outline", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    await page.keyboard.press("Tab");
    const outline = await page.locator(":focus").evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(outline.style).toBe("solid");
    expect(outline.width).toBe("2px");
  });

  test("command outcomes announce through the status live region", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("[data-announcer='status']")).toHaveText("Colony saved.");
    await expect(page.locator(".nova-status")).toHaveText("Colony saved."); // visual preserved
  });

  test("alert announcements fire on kind changes, not every tick", async ({ page }) => {
    await page.goto("/");
    await stripToAnchor(page); // food deficit: alert with per-tick stock numbers
    await page.getByRole("button", { name: "8x", exact: true }).click();
    const announcer = page.locator("[data-announcer='alerts']");
    await expect(announcer).toContainText("Alerts: Food");
    const first = await announcer.textContent();
    await page.waitForTimeout(1200); // several ticks — numbers change, kind stays
    expect(await announcer.textContent()).toBe(first);
    // the visual panel still refreshes with live alert lines
    await expect(page.locator("#stats [data-section='alerts']")).toContainText("Food");
  });

  test("Space on a focused button activates the button, not pause", async ({ page }) => {
    await page.goto("/");
    const before = await page.evaluate(() => window.__nova!.getState().tick);
    await page.getByRole("button", { name: "Save", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.locator(".nova-status")).toHaveText("Colony saved.");
    // simulation still running → the global Space handler did not fire
    await expect
      .poll(async () => page.evaluate(() => window.__nova!.getState().tick))
      .toBeGreaterThan(before);
  });

  test("forecast rows are semantic buttons driving the drill-down", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    const foodRow = page.locator("#stats button[data-resource='food']");
    await expect(foodRow).toHaveCount(1);
    await foodRow.click();
    await expect(page.locator("#inspection")).toBeVisible();
  });

  test("overlay buttons are keyboard-operable and mutate no simulation state", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    const before = await page.evaluate(() => JSON.stringify(window.__nova!.getState()));
    for (const mode of ["food", "water", "pollution"] as const) {
      const button = page.locator(`button[data-action='overlay-${mode}']`);
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(button).toHaveAttribute("data-active", "true");
      await expect(page.locator(".nova-status")).toHaveText(`Overlay: ${mode}`);
    }
    const after = await page.evaluate(() => JSON.stringify(window.__nova!.getState()));
    expect(after).toBe(before);
    // switching to none clears the sibling active markers
    await page.locator("button[data-action='overlay-none']").click();
    await expect(page.locator("button[data-action='overlay-pollution']")).not.toHaveAttribute(
      "data-active",
      "true",
    );
  });
});
