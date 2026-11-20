import { expect, test } from "@playwright/test";
import { pause, waitForTick } from "./helpers.js";

test.describe("NOVA interaction flows", () => {
  test("placement: guidance, paid cost, refusal keeps the selection", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // planks are a physical resource: injecting them proves the quarry gate
    // opens through the palette, and the deduction is atomic. D3: resources
    // build, money only arbitrates — the quarry is paid in 4 planks, never 25 $.
    await page.evaluate(() => {
      window.__nova!.getState().resources.planks = 5;
    });
    const money = await page.evaluate(() => window.__nova!.getState().resources.money);
    await page.locator("button[data-build-type='quarry']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const quarry = await page.evaluate(() => {
      const s = window.__nova!.getState();
      return {
        count: Object.values(s.buildings).filter((b) => b.type === "quarry").length,
        planks: s.resources.planks,
        money: s.resources.money,
      };
    });
    expect(quarry.count).toBe(1);
    expect(quarry.planks).toBe(1); // 5 seeded − 4 for the quarry (D3)
    expect(quarry.money).toBe(money); // placement never bills money (D3)

    // selecting announces the guidance; a successful placement confirms and deselects
    const farm = page.locator("button[data-build-type='farm']");
    await farm.click();
    await expect(page.locator(".nova-status")).toHaveText("Placing Farm — click a free cell");
    const stock = () =>
      page.evaluate(() => ({
        money: window.__nova!.getState().resources.money,
        planks: window.__nova!.getState().resources.planks,
      }));
    const before = await stock();
    await page.locator("#app canvas").click({ position: { x: 700, y: 300 } });
    await expect(page.locator(".nova-status")).toHaveText("Farm placed.");
    await expect(farm).not.toHaveAttribute("data-selected", "true");
    const placed = await stock();
    expect(placed.planks).toBe(before.planks - 1); // one plank per farm (D3)
    expect(placed.money).toBe(before.money);

    // an invalid cell states the reason and keeps the selection armed
    await farm.click();
    await page.locator("#app canvas").click({ position: { x: 700, y: 300 } });
    await expect(page.locator(".nova-status")).toContainText("Cannot place: occupied");
    await expect(farm).toHaveAttribute("data-selected", "true");
  });

  test("inspect → remove restores the cell and the stats; mothball → reactivate balances", async ({
    page,
  }) => {
    await page.goto("/");
    await pause(page);
    // D3: a farm costs one plank and no money. Seeded, then the ticks stay
    // paused, so the deductions asserted below are exact.
    await page.evaluate(() => {
      window.__nova!.getState().resources.planks = 3;
    });
    const base = await page.evaluate(() => window.__nova!.stats().maintenancePerTick);
    const farms = () =>
      page.evaluate(
        () =>
          Object.values(window.__nova!.getState().buildings).filter((b) => b.type === "farm")
            .length,
      );

    // place and mature a farm so it really pays upkeep
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const farmsBefore = await farms();
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__nova!.stats().maintenancePerTick))
      .toBe(base + 1);
    await pause(page);

    // the palette auto-deselected, so this click inspects the building
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const remove = page.locator("button[data-action='remove-building']");
    await expect(remove).toBeVisible();
    // the inspection states the farm's staffing rank and state
    await expect(page.locator("#inspection")).toContainText(
      /staffing · (no road access|\d+\/\d+ · (staffed|idle))/,
    );
    const spent = await page.evaluate(() => ({
      money: window.__nova!.getState().resources.money,
      planks: window.__nova!.getState().resources.planks,
    }));
    await remove.click();
    const removed = await page.evaluate(() => ({
      money: window.__nova!.getState().resources.money,
      planks: window.__nova!.getState().resources.planks,
      maintenance: window.__nova!.stats().maintenancePerTick,
    }));
    expect(await farms()).toBe(farmsBefore - 1);
    expect(removed.money).toBe(spent.money); // no refund
    expect(removed.planks).toBe(spent.planks); // the plank is gone for good
    expect(removed.maintenance).toBe(base); // relief

    // the cell is reusable: same spot, same price
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const again = await page.evaluate(() => ({
      money: window.__nova!.getState().resources.money,
      planks: window.__nova!.getState().resources.planks,
    }));
    expect(await farms()).toBe(farmsBefore);
    expect(again.money).toBe(spent.money); // same spot, same price: one plank
    expect(again.planks).toBe(spent.planks - 1);

    // mothball the matured farm: upkeep stops, the worker frees; reactivate restores
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__nova!.stats().maintenancePerTick))
      .toBe(base + 1);
    await pause(page);
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const mothball = page.locator("button[data-action='deactivate-building']");
    await expect(mothball).toBeVisible();
    await mothball.click();
    const off = await page.evaluate(() => ({
      maintenance: window.__nova!.stats().maintenancePerTick,
      active: Object.values(window.__nova!.getState().buildings).filter(
        (b) => b.type === "farm" && b.active,
      ).length,
    }));
    expect(off.maintenance).toBe(base); // relief at the next calculation
    expect(off.active).toBe(farmsBefore - 1);

    await expect(page.locator("button[data-action='reactivate-building']")).toBeVisible();
    await page.locator("button[data-action='reactivate-building']").click();
    expect(await page.evaluate(() => window.__nova!.stats().maintenancePerTick)).toBe(base + 1);
  });

  test("overlays: every mode drives the scene, drill-down names the contributors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/");
    await pause(page);
    const before = await page.evaluate(() => JSON.stringify(window.__nova!.getState()));

    // each click rebuilds the tinted meshes, so a renderer error surfaces here
    for (const mode of [
      "staffing",
      "deposits",
      "food",
      "water",
      "pollution",
      "population",
      "logistics",
      "none",
    ]) {
      const button = page.locator(`button[data-action='overlay-${mode}']`);
      await button.click();
      await expect(button).toHaveAttribute("data-active", "true");
      expect(await page.evaluate(() => window.__nova!.overlay())).toBe(mode);
    }
    // the last click landed on "none", which clears the sibling markers
    await expect(page.locator("button[data-action='overlay-food']")).not.toHaveAttribute(
      "data-active",
      "true",
    );
    // overlays are a view: they mutate no simulation state
    expect(await page.evaluate(() => JSON.stringify(window.__nova!.getState()))).toBe(before);

    // drill-down: the forecast rows are the entry point, the panel names producers
    for (const [resource, label] of [
      ["food", "Food — contributors"],
      ["water", "Water — contributors"],
    ] as const) {
      await page.locator(`#stats [data-resource='${resource}']`).click();
      const panel = page.locator("#inspection");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(label);
      await expect(panel).toContainText("Consumption:");
      await expect(panel).toContainText(/staffed|idle|mothballed/);
    }
    await expect(page.locator("#inspection")).toContainText("well");

    // Step053 F1: the admission gate names its threshold when air is foul and
    // housing has headroom. D2 ships pop 10 in 10 residences, so three extra
    // homes give the alert room to persist while air quality collapses.
    const placed = await page.evaluate(() => {
      const h = window.__nova!;
      const s = h.getState();
      const roads = Object.values(s.roads).flatMap((r) => r.cells);
      let homes = 0;
      for (let y = 0; y < s.world.height && homes < 3; y++) {
        for (let x = 0; x < s.world.width && homes < 3; x++) {
          const k = `${x},${y}`;
          if (s.world.blockedCells[k] || s.woodDeposits[k] || s.stoneDeposits[k]) continue;
          if (roads.includes(k)) continue;
          if (Object.values(s.buildings).some((b) => b.x === x && b.y === y)) continue;
          if (h.command({ kind: "placeBuilding", type: "residence", x, y }).ok) homes++;
        }
      }
      s.pollution = 90; // quality 10 → below the 25 admission threshold
      s.resources.food = 30;
      return homes;
    });
    expect(placed).toBe(3);
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect(page.locator(".nova-alerts")).toContainText("Growth blocked");
    await expect(page.locator(".nova-alerts")).toContainText("admission threshold 25");
    await pause(page);
    expect(errors).toEqual([]);
  });

  test("keyboard: Space toggles pause, digits set speed", async ({ page }) => {
    await page.goto("/");
    await waitForTick(page, 2); // running at 1x

    // Space → pause: the tick freezes
    await page.keyboard.press("Space");
    const pausedTick = await page.evaluate(() => window.__nova!.getState().tick);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__nova!.getState().tick)).toBe(pausedTick);

    // Space again → resume at last speed
    await page.keyboard.press("Space");
    await waitForTick(page, pausedTick + 2);

    // digit 8 → 8x: many ticks in a short window (≈24 at 16 tps, ≈3 at 1x)
    await page.keyboard.press("8");
    const before8 = await page.evaluate(() => window.__nova!.getState().tick);
    await page.waitForTimeout(1500);
    await pause(page);
    const after8 = await page.evaluate(() => window.__nova!.getState().tick);
    expect(after8 - before8).toBeGreaterThan(10);
  });

  test("save/load round-trip, overlay coherence, and preference persistence", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    // D3: a residence and a farm cost one plank each; money is not billed.
    await page.evaluate(() => {
      window.__nova!.getState().resources.planks = 3;
    });

    // a player change, saved, then reverted by a second placement
    await page.locator("button[data-build-type='residence']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await page.locator("button[data-action='save']").click();
    await expect(page.locator(".nova-status")).toHaveText("Colony saved.");
    const saved = await page.evaluate(() => {
      const s = window.__nova!.getState();
      return {
        money: s.resources.money,
        planks: s.resources.planks,
        residences: Object.values(s.buildings).filter((b) => b.type === "residence").length,
      };
    });
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 700, y: 300 } });
    const afterPlacement = await page.evaluate(() => {
      const s = window.__nova!.getState();
      return { money: s.resources.money, planks: s.resources.planks };
    });
    expect(afterPlacement.money).toBe(saved.money); // D3: no money cost
    expect(afterPlacement.planks).toBe(saved.planks - 1); // one plank for the farm

    await page.locator("button[data-action='load']").click();
    await expect(page.locator(".nova-status")).toHaveText("Colony loaded.");
    expect(
      await page.evaluate(() => {
        const s = window.__nova!.getState();
        return {
          money: s.resources.money,
          planks: s.resources.planks,
          residences: Object.values(s.buildings).filter((b) => b.type === "residence").length,
        };
      }),
    ).toEqual(saved);

    // Step039: the UI keeps its overlay across a load while a fresh renderer
    // boots with "none" — the scene must not diverge from the marker
    await page.locator("button[data-action='overlay-staffing']").click();
    await page.locator("button[data-action='save']").click();
    await page.locator("button[data-action='load']").click();
    await expect(page.locator(".nova-status")).toHaveText("Colony loaded.");
    await expect(page.locator("button[data-action='overlay-staffing']")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(await page.evaluate(() => window.__nova!.overlay())).toBe("staffing");
    await page.locator("button[data-action='overlay-none']").click();
    expect(await page.evaluate(() => window.__nova!.overlay())).toBe("none");

    // preferences survive a reload, and a corrupt payload falls back to defaults
    await page.locator("button[data-action='speed-4x']").click();
    await page.locator("button[data-action='overlay-food']").click();
    await page.reload();
    await expect(page.locator("button[data-action='speed-4x']")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.locator("button[data-action='overlay-food']")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(await page.evaluate(() => window.__nova!.overlay())).toBe("food");

    await page.evaluate(() => localStorage.setItem("nova-prefs", "not-json{"));
    await page.reload();
    for (const action of ["speed-4x", "overlay-food"]) {
      await expect(page.locator(`button[data-action='${action}']`)).not.toHaveAttribute(
        "data-active",
        "true",
      );
    }
    expect(await page.evaluate(() => window.__nova!.overlay())).toBe("none");
  });
});

test.describe("W1 inactivity reason in the inspector", () => {
  test("names the cause, and follows it when the cause changes", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // Make the cause under test unambiguous: ONE tail post (the workshop we
    // build) and ONE spare worker. The day-0 colony employs exactly one colonist
    // per vital post, so free a seat by removing one well (its water is buffered
    // for the few ticks this test runs). The status line is what is being
    // measured, not survival.
    await page.evaluate(() => {
      const state = window.__nova!.getState();
      state.resources.planks = 20;
      state.resources.wood = 0;
      state.resources.food = 180;
      state.resources.water = 80;
      let freed = false;
      for (const b of Object.values(state.buildings)) {
        if (b.type === "workshop") window.__nova!.command({ kind: "removeBuilding", id: b.id });
        if (!freed && b.type === "well") {
          window.__nova!.command({ kind: "removeBuilding", id: b.id });
          freed = true;
        }
      }
    });

    // Place a workshop through the real palette, then inspect the same cell.
    await page.locator("button[data-build-type='workshop']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });

    const activity = page.locator("#inspection [data-activity]");
    await expect(activity).toHaveText("En construction");

    // Give it road access: staffing requires it, and the click position is not a
    // promised road cell. A real road command on a free neighbour of the new
    // workshop — the same law the campaign follows.
    await page.evaluate(() => {
      const state = window.__nova!.getState();
      const shop = Object.values(state.buildings).find(
        (b) => b.type === "workshop" && b.status === "underConstruction",
      );
      if (!shop) throw new Error("workshop missing");
      const cells: string[] = [];
      for (const road of Object.values(state.roads)) cells.push(...road.cells);
      const neighbours = [
        { x: shop.x + 1, y: shop.y },
        { x: shop.x - 1, y: shop.y },
        { x: shop.x, y: shop.y + 1 },
        { x: shop.x, y: shop.y - 1 },
      ];
      const free = neighbours.find((c) => {
        const key = `${c.x},${c.y}`;
        if (c.x < 0 || c.y < 0 || c.x >= state.world.width || c.y >= state.world.height) return false;
        if (cells.includes(key)) return false;
        return !Object.values(state.buildings).some((b) => b.x === c.x && b.y === c.y);
      });
      if (!free) throw new Error("no free neighbour for a road");
      const result = window.__nova!.command({ kind: "placeRoads", cells: [`${free.x},${free.y}`] });
      if (!result.ok) throw new Error("road refused: " + result.reason);
    });

    // Finish the shell: under the official law a workshop with no wood is NOT
    // staffed — the status line is the very thing that has to explain it.
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Object.values(window.__nova!.getState().buildings).some(
              (b) => b.type === "workshop" && b.status === "operational",
            ),
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
    await pause(page);

    // No wood: the panel names the INPUT, not the workforce.
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await expect(activity).toHaveText("Matière première insuffisante");

    // The wood arrives: the same building is staffed, then transforms on the
    // following tick (assignment decides, the phase consumes). 1x so the stock
    // cannot be eaten before the panel is read.
    const tickBefore = await page.evaluate(() => window.__nova!.getState().tick);
    await page.evaluate(() => {
      // Enough for many batches: the panel is read after a few ticks, and a
      // stock that ran dry would (correctly) flip the reason back to input.
      window.__nova!.getState().resources.wood = 100;
    });
    await page.getByRole("button", { name: "1x", exact: true }).click();
    await waitForTick(page, tickBefore + 2);
    await pause(page);
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await expect(activity).toHaveText("Opérationnel");

    // Resting is a decision, not a shortage: the panel says so.
    await page.locator("button[data-action='deactivate-building']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await expect(activity).toHaveText("Bâtiment au repos");
  });
});
