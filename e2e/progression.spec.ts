import { expect, test } from "@playwright/test";
import { pause } from "./helpers.js";

test.describe("NOVA progression", () => {
  test("age progression loop: Age 1 → 2 → 3 through the progression panel", async ({ page }) => {
    // Step036: closes the Step035 gap ("no journey reaches Age 3 through
    // the UI yet"). Scenario resources (treasury, workforce, planks) are
    // set via the diagnostics surface like every other journey; every
    // milestone gate and transition goes through the real UI: research
    // buttons, market placement, advance buttons.
    await page.goto("/");
    await pause(page);

    // --- scenario setup: treasury for 5 techs + market, planks for the
    // market, workforce so pop15 is a stable milestone value ---
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
    // Age-2 set renders, including the Step024 market milestone
    await expect(page.locator("#progression")).toContainText("1 operational market");
    // gate: all 5 required — advance hidden until market + age-2 techs
    await expect(page.locator("button[data-action='advance-age']")).toHaveCount(0);

    // --- build the market via palette + canvas (unlocked in Age 2) ---
    const marketButton = page.locator("button[data-build-type='market']");
    await expect(marketButton).toBeEnabled();
    await marketButton.click();
    await page.locator("#app canvas").click({ position: { x: 400, y: 300 } });
    const marketCell = await page.evaluate(() => {
      const s = window.__nova!.getState();
      const market = Object.values(s.buildings).find((b) => b.type === "market");
      if (!market) throw new Error("market not placed");
      return { x: market.x, y: market.y };
    });

    // market sales require a touching road (scenario setup via command;
    // the operational/status chain itself stays simulated)
    await page.evaluate((cell) => {
      const h = window.__nova!;
      const s = h.getState();
      const roads = Object.values(s.roads).flatMap((r) => r.cells);
      const touches = [`${cell.x + 1},${cell.y}`, `${cell.x - 1},${cell.y}`, `${cell.x},${cell.y + 1}`, `${cell.x},${cell.y - 1}`];
      if (touches.some((k) => roads.includes(k))) return;
      const spot = touches.find((k) => {
        const [x, y] = k.split(",").map(Number);
        if (x! < 0 || y! < 0 || x! >= s.world.width || y! >= s.world.height) return false;
        if (s.world.blockedCells[k]) return false;
        if (s.woodDeposits[k] || s.stoneDeposits[k]) return false;
        return !Object.values(s.buildings).some((b) => `${b.x},${b.y}` === k);
      });
      if (!spot) throw new Error("no free neighbor for market road");
      const r = h.command({ kind: "placeRoads", cells: [spot] });
      if (!r.ok) throw new Error("market road failed: " + r.reason);
    }, marketCell);

    // let the market finish construction (2 ticks), then check the
    // milestone through the diagnostics surface
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const s = window.__nova!.getState();
          const market = Object.values(s.buildings).find((b) => b.type === "market");
          return market?.status ?? "missing";
        }),
      )
      .toBe("operational");
    await pause(page);
    expect(
      await page.evaluate(() =>
        window.__nova!.milestones().find((m) => m.id === "market1")?.done,
      ),
    ).toBe(true);

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
    await expect(panel).toContainText("24/30"); // D2 23 + market
    await expect(panel).toContainText("10/20");
    await expect(panel).toContainText("2/3");
    // no advance action exists past the last set
    await expect(page.locator("button[data-action='advance-age']")).toHaveCount(0);
  });
});
