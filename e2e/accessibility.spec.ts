import { expect, test } from "@playwright/test";
import { pause } from "./helpers.js";

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
    // Scenario: a persistent alert whose NUMBERS change while its kind AND
    // severity stay stable — the environment alert (pollution rises, quality
    // falls but stays above the warning band at 25). The game's own emitters
    // are mothballed so the rise is controlled and deterministic; a
    // food-deficit alert would instead vanish (the colony starves).
    await page.evaluate(() => {
      const h = window.__nova!;
      const s = h.getState();
      s.pollution = 52; // quality 48 -> alert fires, still "info" severity
      for (const b of Object.values(s.buildings)) {
        if (b.type === "workshop") {
          h.command({ kind: "setBuildingActive", id: b.id, active: false });
        }
      }
      // controlled rise: +1 per 100ms (the colony's own emitters are off)
      window.setInterval(() => {
        h.getState().pollution += 1;
      }, 100);
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    const announcer = page.locator("[data-announcer='alerts']");
    await expect(announcer).toContainText("Alerts: Environment");
    const first = await announcer.textContent();
    const firstPollution = Number(first?.match(/pollution (\d+)/)?.[1] ?? -1);
    await page.waitForTimeout(600); // several ticks — numbers change, kind stays
    // the live region stayed silent: same kinds, same severity -> no re-announce
    expect(await announcer.textContent()).toBe(first);
    expect(await announcer.textContent()).not.toContain("Alerts cleared");
    // the world moved on: the visual panel shows a newer pollution value
    const visual = page.locator("#stats [data-section='alerts']");
    await expect(visual).toContainText("Environment");
    const visualPollution = Number((await visual.textContent())?.match(/pollution (\d+)/)?.[1] ?? -1);
    expect(visualPollution).toBeGreaterThan(firstPollution);
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
