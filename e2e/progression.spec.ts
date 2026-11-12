import { expect, test } from "@playwright/test";
import { pause } from "./helpers.js";

test.describe("NOVA progression", () => {
  test("age progression loop: Age 1 → 2 → 3 through the progression panel", async ({ page }) => {
    // Step036: closes the Step035 gap ("no journey reaches Age 3 through
    // the UI yet"). Scenario resources (treasury, workforce, planks) are
    // set via the diagnostics surface like every other journey; every
    // milestone gate and transition goes through the real UI: research
    // buttons, advance buttons. Step065 removed the market milestone.
    await page.goto("/");
    await pause(page);

    // --- scenario setup: treasury for 5 techs, planks for the run,
    // workforce so pop15 is a stable milestone value ---
    await page.evaluate(() => {
      const s = window.__nova!.getState();
      s.resources.money = 1500;
      s.resources.planks = 5;
      s.population = 15;
    });

    // --- Age 1: panel shows the set; advance hidden until tech3 done ---
    await expect(page.locator("#progression")).toContainText("Age of Founding (Age 1)");
    await expect(page.locator("#progression")).toContainText("Population 8");
    await expect(page.locator("#progression")).toContainText("3 technologies researched");
    await expect(page.locator("button[data-action='advance-age']")).toHaveCount(0);

    // research 3 age-1 technologies via the panel (UI)
    for (const tech of ["cropRotation", "masonry", "tradeRoutes"]) {
      await page.locator(`button[data-action='research-${tech}']`).click();
    }
    expect(await page.evaluate(() => window.__nova!.getState().researchedTechs.length)).toBe(3);

    // --- advance to Age 2 via the panel button (UI) ---
    const advance1 = page.locator("button[data-action='advance-age']");
    await expect(advance1).toBeVisible();
    await advance1.click();
    expect(await page.evaluate(() => window.__nova!.getState().age)).toBe(2);
    await expect(page.locator("#progression")).toContainText("Age of Expansion (Age 2)");
    // Age-2 set renders (four Step021 dimensions, no market since Step065)
    await expect(page.locator("#progression")).toContainText("5 technologies researched");
    await expect(page.locator("#progression")).not.toContainText("operational market");
    // gate: all four required — advance hidden until the age-2 techs land
    await expect(page.locator("button[data-action='advance-age']")).toHaveCount(0);

    // --- research the two age-2 technologies via the panel (UI) ---
    for (const tech of ["irrigation", "deepMining"]) {
      await page.locator(`button[data-action='research-${tech}']`).click();
    }
    expect(await page.evaluate(() => window.__nova!.getState().researchedTechs.length)).toBe(5);

    // --- advance to Age 3 via the panel button (UI) ---
    const advance2 = page.locator("button[data-action='advance-age']");
    await expect(advance2).toBeVisible();
    await advance2.click();
    expect(await page.evaluate(() => window.__nova!.getState().age)).toBe(3);

    // --- Age 3 renders: name, all five prosperity milestones, values ---
    const panel = page.locator("#progression");
    await expect(panel).toContainText("Age of Prosperity (Age 3)");
    await expect(panel).toContainText("Population 20");
    await expect(panel).toContainText("Treasury 1500");
    await expect(panel).toContainText("30 operational buildings");
    await expect(panel).toContainText("20 residences");
    await expect(panel).toContainText("3 operational workshops");
    // current values against thresholds (none complete at this point)
    await expect(panel).toContainText("15/20");
    await expect(panel).toContainText("23/30"); // D2 ships 23 (no market since Step065)
    await expect(panel).toContainText("10/20");
    await expect(panel).toContainText("2/3");
    // no advance action exists past the last set
    await expect(page.locator("button[data-action='advance-age']")).toHaveCount(0);
  });
});
