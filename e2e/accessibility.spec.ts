import { expect, test } from "@playwright/test";
import { pause } from "./helpers.js";

/**
 * Tier2 accessibility regressions: visible keyboard focus, polite live
 * regions for command outcomes and alert-kind changes, Space on focused
 * buttons, and the overlay toggles (keyboard + no state mutation).
 */

test.describe("accessibility (Tier2)", () => {
  test("focus outline, Space acting on the focused button, and announced outcomes", async ({
    page,
  }) => {
    await page.goto("/");

    // the first Tab stop shows the focus ring
    await page.keyboard.press("Tab");
    const outline = await page.locator(":focus").evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(outline.style).toBe("solid");
    expect(outline.width).toBe("2px");

    // Space on a focused button activates that button, not the global pause
    const before = await page.evaluate(() => window.__nova!.getState().tick);
    await page.getByRole("button", { name: "Save", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.locator(".nova-status")).toHaveText("Colony saved.");
    await expect(page.locator("[data-announcer='status']")).toHaveText("Colony saved.");
    await expect
      .poll(async () => page.evaluate(() => window.__nova!.getState().tick))
      .toBeGreaterThan(before);
  });

  test("alert announcements fire on kind changes, not every tick", async ({ page }) => {
    await page.goto("/");
    // Scenario: a persistent alert whose NUMBERS change while its kind AND
    // severity stay stable — the environment alert (pollution rises, quality
    // falls but stays above the warning band at 25). A food-deficit alert
    // would instead vanish (the colony starves).
    //
    // The D2 opening is left exactly as shipped: since Step083 its park absorbs
    // the two unstaffed workshops it also emits, so net air is 0 and the
    // authored stock drifts only by the controlled +1 per 100 ms below. This
    // used to mothball every workshop first, which stopped working the moment
    // the park existed: net -2/tick ate all 52 points before the first frame
    // and the alert the test waits for never appeared (measured 2026-11-17).
    //
    // The treasury is topped up for a different reason — the budget line keeps
    // a stable "info" kind only while money is above 0; at 0 it becomes the
    // "warning" treasury line, a kind change this test would read as noise.
    await page.evaluate(() => {
      const h = window.__nova!;
      const s = h.getState();
      s.pollution = 52; // quality 48 -> alert fires, still "info" severity
      s.resources.money = 5000;
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

  test("forecast rows open the drill-down; overlay toggles are keyboard-operable and inert", async ({
    page,
  }) => {
    await page.goto("/");
    await pause(page);

    // the forecast rows are real buttons, not clickable divs
    const foodRow = page.locator("#stats button[data-resource='food']");
    await expect(foodRow).toHaveCount(1);
    await foodRow.click();
    await expect(page.locator("#inspection")).toBeVisible();

    const before = await page.evaluate(() => JSON.stringify(window.__nova!.getState()));
    for (const mode of ["food", "water", "pollution", "logistics"] as const) {
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
