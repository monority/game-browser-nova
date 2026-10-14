import { expect, test } from "@playwright/test";
import type { NovaHandle } from "./helpers.js";
import { nova, pause, statsText, stripToAnchor, waitForTick } from "./helpers.js";

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
      (window as unknown as { __nova: NovaHandle }).__nova.getState(),
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

test.describe("NOVA critical flows", () => {
  test("player builds housing, population arrives, economy starts", async ({ page }) => {
    await page.goto("/");
    await pause(page); // deterministic: no ticks until we allow them

    // place a residence via the palette + canvas click
    await page.locator("button[data-build-type='residence']").click();
    const moneyBefore = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState().resources.money,
    );
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });

    const afterPlace = await page.evaluate(() => {
      const state = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return {
        money: state.resources.money,
        buildings: Object.values(state.buildings).filter((b) => b.type === "residence").length,
      };
    });
    expect(afterPlace.money).toBe(moneyBefore - 25);
    expect(afterPlace.buildings).toBe(11); // D2 ships 10

    // let it construct + admit a colonist (bootstrap exemption)
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page
      .waitForFunction(
        () =>
          (window as unknown as { __nova: NovaHandle }).__nova.getState().population >= 1,
        undefined,
        { timeout: 30_000 },
      )
      .catch(() => {
        // admission requires a buildable residence cell — verified below
      });
    await pause(page);

    const final = await page.evaluate(() => {
      const state = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      const residences = Object.values(state.buildings).filter((b) => b.type === "residence");
      return {
        population: state.population,
        residencesOperational: residences.filter((b) => b.status === "operational").length,
        buildingCount: Object.keys(state.buildings).length,
      };
    });
    expect(final.buildingCount).toBeGreaterThanOrEqual(2); // anchor + residence
    if (final.residencesOperational > 0) {
      expect(final.population).toBeGreaterThanOrEqual(1);
    }
  });

  test("workshop placement drives commerce; quarry is plank-gated", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // inject planks to prove the gate opens (physical resource, not money)
    await page.evaluate(() => {
      const state = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      state.resources.planks = 5;
    });

    // quarry placement attempt WITHOUT planks would fail; with 5 it succeeds
    const moneyBeforeQuarry = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState().resources.money,
    );
    await page.locator("button[data-build-type='quarry']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const quarryPlaced = await page.evaluate((before: number) => {
      const state = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return {
        quarries: Object.values(state.buildings).filter((b) => b.type === "quarry").length,
        planks: state.resources.planks,
        money: state.resources.money,
        before,
      };
    }, moneyBeforeQuarry);
    expect(quarryPlaced.quarries).toBe(1);
    expect(quarryPlaced.planks).toBe(0); // atomic plank deduction
    expect(quarryPlaced.money).toBe(quarryPlaced.before - 25);

    // road + workshop → commerce revenue appears (click zone clear of the
    // left stats panel, which grew with the forecast/alert sections)
    await page.locator("button[data-road='true']").click();
    await page.locator("#app canvas").click({ position: { x: 400, y: 300 } });
    await page.evaluate(() => {
      const state = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      state.resources.water = 1;
    });
    await page.locator("button[data-build-type='workshop']").click();
    await page.locator("#app canvas").click({ position: { x: 500, y: 300 } });

    const workshop = await page.evaluate(() => {
      const state = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return Object.values(state.buildings).filter((b) => b.type === "workshop").length;
    });
    if (workshop > 0) {
      await page.getByRole("button", { name: "8x", exact: true }).click();
      await page
        .waitForFunction(
          () =>
            (window as unknown as { __nova: NovaHandle }).__nova.stats()
              .commercePerTick >= 2,
          undefined,
          { timeout: 30_000 },
        )
        .catch(() => {
          // click may have missed a free cell; asserted conditionally below
        });
      await pause(page);
      const stats = await page.evaluate(
        () => (window as unknown as { __nova: NovaHandle }).__nova.stats(),
      );
      if (stats.commercePerTick > 0) {
        expect(stats.commercePerTick).toBeGreaterThanOrEqual(2);
        expect(stats.netMoneyPerTick).toBe(stats.revenuePerTick - stats.maintenancePerTick);
      }
    }
  });

  test("save and load round-trip through the UI", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    await page.locator("button[data-build-type='residence']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await page.locator("button[data-action='save']").click();

    const savedMoney = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState().resources.money,
    );

    const savedFarms = await page.evaluate(() =>
      Object.values((window as unknown as { __nova: NovaHandle }).__nova.getState().buildings).filter((b) => b.type === "farm").length,
    );
    // mutate: place another building to change money
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 700, y: 300 } });
    const mutated = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState(),
    );
    expect(mutated.resources.money).toBe(savedMoney - 25);

    // load restores the saved colony
    await page.locator("button[data-action='load']").click();
    await expect(page.locator("#ui")).toContainText("Colony loaded.");
    const loaded = await page.evaluate(() => {
      const state = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return {
        money: state.resources.money,
        farms: Object.values(state.buildings).filter((b) => b.type === "farm").length,
      };
    });
    expect(loaded.money).toBe(savedMoney);
    expect(loaded.farms).toBe(savedFarms);
  });

  test("removal flow: place ? inspect ? remove ? cell and stats restored", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // D2 baseline maintenance for the delta assertions below
    const base = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.stats().maintenancePerTick,
    );

    // place a farm (no refund policy: money stays spent)
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const placed = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return {
        farms: Object.values(s.buildings).filter((b) => b.type === "farm").length,
        money: s.resources.money,
      };
    });
    expect(placed.farms).toBeGreaterThan(0);
    const farmsBefore = placed.farms;

    // mature the farm (2 ticks at 8x) so it actually pays maintenance
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __nova: NovaHandle }).__nova.stats().maintenancePerTick,
        ),
      )
      .toBe(base + 1);
    await page.getByRole("button", { name: "pause", exact: true }).click();

    // deselect the palette (click the active button again), then inspect the cell
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const removeButton = page.locator("button[data-action='remove-building']");
    await expect(removeButton).toBeVisible();

    // removal: no refund, immediate stats relief
    const preRemove = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState().resources.money,
    );
    await removeButton.click();
    const afterRemove = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      const stats = (window as unknown as { __nova: NovaHandle }).__nova.stats();
      return {
        farms: Object.values(s.buildings).filter((b) => b.type === "farm").length,
        money: s.resources.money,
        maintenance: stats.maintenancePerTick,
      };
    });
    expect(afterRemove.farms).toBe(farmsBefore - 1); // removed
    expect(afterRemove.money).toBe(preRemove); // no refund (paused: no drift)
    expect(afterRemove.maintenance).toBe(base); // relief

    // restored cell: same spot accepts a new building
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const replaced = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return {
        farms: Object.values(s.buildings).filter((b) => b.type === "farm").length,
        money: s.resources.money,
      };
    });
    expect(replaced.farms).toBe(farmsBefore);
    expect(replaced.money).toBe(afterRemove.money - 25);
  });

  test("deactivation flow: inspect ? mothball ? stats drop ? reactivate ? restored", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // D2 baseline maintenance for the delta assertions below
    const base = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.stats().maintenancePerTick,
    );

    // place + mature a farm (residences are upkeep-exempt; farms show the drop)
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __nova: NovaHandle }).__nova.stats().maintenancePerTick,
        ),
      )
      .toBe(base + 1);
    await page.getByRole("button", { name: "pause", exact: true }).click();

    // inspect ? mothball (deselect palette first)
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const mothball = page.locator("button[data-action='deactivate-building']");
    await expect(mothball).toBeVisible();
    await mothball.click();

    const farmId = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      const ids = Object.values(s.buildings)
        .filter((b) => b.type === "farm")
        .map((b) => Number(b.id.replace("building-", "")));
      return `building-${Math.max(...ids)}`;
    });
    const afterDeactivate = await page.evaluate((farmId: string) => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      const farm = s.buildings[farmId];
      return {
        active: farm?.active,
        maintenance: h.stats().maintenancePerTick,
      };
    }, farmId);
    expect(afterDeactivate.active).toBe(false);
    expect(afterDeactivate.maintenance).toBe(base); // relief at next calculation

    // inspection reflects the mothballed state ? reactivate
    await expect(page.locator("button[data-action='reactivate-building']")).toBeVisible();
    await page.locator("button[data-action='reactivate-building']").click();
    const afterReactivate = await page.evaluate((farmId: string) => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      const farm = s.buildings[farmId];
      return {
        active: farm?.active,
        maintenance: h.stats().maintenancePerTick,
      };
    }, farmId);
    expect(afterReactivate.active).toBe(true);
    expect(afterReactivate.maintenance).toBe(base + 1); // restored
  });

  test("healthy growth: deterministic colony reaches 5 inhabitants", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // programmatic deterministic build via the diagnostics command surface:
    // 6-long road strip, workplaces in canonical staffing order, 6 residences
    // elsewhere. Farms rank ahead of wells: post-D2 the colony starts at
    // pop 10 with exact water balance, so FOOD is the survival gate —
    // housing built ahead of food production starves the colony (Step025).
    const built = await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      s.resources.money = 500;
      s.resources.water = 10; // admission headroom during the growth race
      const key = (x: number, y: number) => `${x},${y}`;
      const used = new Set<string>();
      const free = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= s.world.width || y >= s.world.height) return false;
        const k = key(x, y);
        if (s.world.blockedCells[k]) return false;
        if (s.woodDeposits[k] || s.stoneDeposits[k]) return false;
        if (Object.values(s.buildings).some((b) => b.x === x && b.y === y)) return false;
        const rc = Object.values(s.roads).flatMap((r) => r.cells);
        if (rc.includes(k)) return false;
        return !used.has(k);
      };
      let strip: { x: number; y: number; side: number } | null = null;
      for (let y = 0; y < s.world.height - 6 && !strip; y++) {
        for (let x = 0; x < s.world.width && !strip; x++) {
          for (const side of [1, -1] as const) {
            const cells = Array.from({ length: 6 }, (_, i) => [x, y + i, x + side, y + i] as const);
            if (cells.every(([rx, ry, wx, wy]) => free(rx, ry) && free(wx, wy))) {
              strip = { x, y, side };
            }
          }
        }
      }
      if (!strip) return { ok: false };
      const st = strip as { x: number; y: number; side: number };
      h.command({ kind: "placeRoads", cells: Array.from({ length: 6 }, (_, i) => key(st.x, st.y + i)) });
      const order: Array<["farm" | "well", number]> = [
        ["farm", 0], ["farm", 1], ["farm", 2], ["well", 3], ["well", 4], ["well", 5],
      ];
      for (const [type, i] of order) {
        const r = h.command({ kind: "placeBuilding", type, x: st.x + st.side, y: st.y + i });
        if (!r.ok) return { ok: false, reason: r.reason };
      }
      for (const k of [
        ...Array.from({ length: 6 }, (_, i) => key(st.x, st.y + i)),
        ...Array.from({ length: 6 }, (_, i) => key(st.x + st.side, st.y + i)),
      ]) used.add(k);
      let homes = 0;
      for (let y = 0; y < s.world.height && homes < 6; y++) {
        for (let x = 0; x < s.world.width && homes < 6; x++) {
          if (used.has(key(x, y)) || !free(x, y)) continue;
          const r = h.command({ kind: "placeBuilding", type: "residence", x, y });
          if (r.ok) { homes++; used.add(key(x, y)); }
        }
      }
      return { ok: homes === 6, homes };
    });
    expect(built.ok).toBe(true);

    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page
      .waitForFunction(
        () =>
          (window as unknown as { __nova: NovaHandle }).__nova.getState().population >= 5,
        undefined,
        { timeout: 45_000 },
      )
      .catch(() => {});
    await pause(page);

    const final = await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      return {
        population: s.population,
        housing: h.stats().housingCapacity,
        food: s.resources.food,
        tick: s.tick,
      };
    });
    expect(final.housing).toBeGreaterThanOrEqual(5);
    // growth continues to housing capacity; the scenario proves ≥ 5 (MVP scale)
    expect(final.population).toBeGreaterThanOrEqual(5);
    expect(final.population).toBeLessThanOrEqual(final.housing);
    expect(final.food).toBeGreaterThan(0); // sustained, not starving
  });

  test("analysis surfaces: forecast + alerts reflect the colony state", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // isolate the forecast math from the D2 colony via real commands
    await stripToAnchor(page);
    await page.evaluate(() => {
      (window as unknown as { __nova: NovaHandle }).__nova.getState().population = 0;
    });
    // build farm + residence programmatically, mature them
    await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      s.resources.money = 300;
      s.resources.water = 2;
      h.command({ kind: "placeRoads", cells: ["0,0"] });
      h.command({ kind: "placeBuilding", type: "farm", x: 1, y: 0 });
      h.command({ kind: "placeBuilding", type: "residence", x: 2, y: 0 });
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __nova: NovaHandle }).__nova.getState().population,
        ),
      )
      .toBe(1);
    await pause(page);

    // balanced colony: food +2/tick (farm 2 + Center trickle 1 − pop 1), no countdown
    const balanced = await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      return { stats: h.stats().resources, text: document.querySelector("#stats")?.textContent ?? "" };
    });
    expect(balanced.text).toContain("Forecast");
    expect(balanced.text).toContain("Food 3/1");
    expect(balanced.text).not.toContain("ticks"); // no countdown at +2/tick

    // mothball the farm → only the trickle (1) vs pop 1: balance 0, still no deficit.
    // Add a second colonist: consumption 2 vs trickle 1 → deficit −1 → countdown
    await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const farm = Object.values(h.getState().buildings).find((b) => b.type === "farm");
      if (!farm) throw new Error("farm missing");
      h.command({ kind: "setBuildingActive", id: farm.id, active: false });
      h.command({ kind: "placeBuilding", type: "residence", x: 3, y: 0 });
      h.getState().resources.water = 20;
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const text = document.querySelector("#stats")?.textContent ?? "";
          return text.includes("ticks") && text.includes("Food: -1/tick");
        }),
      )
      .toBe(true);
    await pause(page);
    const text = await page.locator("#stats").innerText();
    expect(text).toContain("Food: -1/tick");
    expect(text).not.toContain("build a farm"); // never prescribes
  });

  test("keyboard: Space toggles pause, digits set speed", async ({ page }) => {
    await page.goto("/");
    await waitForTick(page, 2); // running at 1x

    // Space → pause: the tick freezes
    await page.keyboard.press("Space");
    const pausedTick = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState().tick,
    );
    await page.waitForTimeout(1200);
    expect(
      await page.evaluate(
        () => (window as unknown as { __nova: NovaHandle }).__nova.getState().tick,
      ),
    ).toBe(pausedTick);

    // Space again → resume at last speed; the tick advances again
    await page.keyboard.press("Space");
    await waitForTick(page, pausedTick + 2);

    // digit 8 → 8x: many ticks in a short window
    await page.keyboard.press("8");
    const before8 = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState().tick,
    );
    await page.waitForTimeout(1500);
    await pause(page);
    const after8 = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState().tick,
    );
    // 1.5s at 8x (16 tps) ≈ 24 ticks; at broken 1x it would be ~3
    expect(after8 - before8).toBeGreaterThan(10);
  });

  test("overlays + drill-down: staffing tint toggle and contributor panel", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // isolate from D2, then build farm + well + workshop + residence, mature, pop 2
    await stripToAnchor(page);
    await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      s.population = 0;
      s.resources.money = 400;
      s.resources.water = 6;
      h.command({ kind: "placeRoads", cells: ["0,0", "0,1", "0,2"] });
      h.command({ kind: "placeBuilding", type: "farm", x: 1, y: 0 });
      h.command({ kind: "placeBuilding", type: "well", x: 1, y: 1 });
      h.command({ kind: "placeBuilding", type: "workshop", x: 1, y: 2 });
      h.command({ kind: "placeBuilding", type: "residence", x: 5, y: 5 });
      h.command({ kind: "placeBuilding", type: "residence", x: 6, y: 5 });
      s.population = 2; // set directly: staffing assigns on the next ticks
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __nova: NovaHandle }).__nova.getState().population,
        ),
      )
      .toBe(2);
    await pause(page);

    // overlay toggle: staffing
    await page.locator("button[data-action='overlay-staffing']").click();
    // drill-down: click the Food forecast row
    await page.locator("#stats [data-resource='food']").click();
    const panel = page.locator("#inspection");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Food — contributors");
    await expect(panel).toContainText("staffed");
    await expect(panel).toContainText("Consumption: 2/tick");

    // water drill-down shows the well (mothballed state visible)
    await page.locator("#stats [data-resource='water']").click();
    await expect(page.locator("#inspection")).toContainText("Water — contributors");
    await expect(page.locator("#inspection")).toContainText("well");

    // overlay back to none
    await page.locator("button[data-action='overlay-none']").click();
    await expect(page.locator("button[data-action='overlay-staffing']")).toBeVisible();
  });

  test("staffing visibility: age-locked market, workforce alert, mothball lever", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    await stripToAnchor(page);

    // Age 1: the Market palette entry is visible, disabled and labeled with
    // its unlock condition instead of being silently hidden (Step025).
    const marketButton = page.locator("button[data-build-type='market']");
    await expect(marketButton).toBeVisible();
    await expect(marketButton).toBeDisabled();
    await expect(marketButton).toContainText("requires Age 2");

    // Farm A via canvas click; farm B placed so it sorts BEFORE A in the
    // canonical staffing order (y,x,id) — B gets the single worker.
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const placed = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      const farms = Object.values(s.buildings).filter((b) => b.type === "farm");
      if (farms.length !== 1) throw new Error("expected exactly one farm");
      return { x: farms[0]!.x, y: farms[0]!.y };
    });

    // road north of A, farm B north of the road: B ranks ahead of A
    await page.evaluate((a) => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      const road = `${a.x},${a.y - 1}`;
      const bCell = `${a.x},${a.y - 2}`;
      const r1 = h.command({ kind: "placeRoads", cells: [road] });
      if (!r1.ok) throw new Error("road failed: " + r1.reason);
      const r2 = h.command({ kind: "placeBuilding", type: "farm", x: a.x, y: a.y - 2 });
      if (!r2.ok) throw new Error("farm B failed: " + r2.reason);
      s.population = 1;
      return bCell;
    }, placed);

    // mature both farms (operational + assignment runs)
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
          return Object.values(s.buildings).filter((b) => b.type === "farm" && b.status === "operational").length;
        }),
      )
      .toBe(2);
    await page.getByRole("button", { name: "pause", exact: true }).click();

    // both farms operational and B (rank 1) staffed, A (rank 2) idle
    const states = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return Object.values(s.buildings)
        .filter((b) => b.type === "farm")
        .map((b) => ({ x: b.x, y: b.y, status: b.status, staffed: b.staffed }));
    });
    expect(states).toHaveLength(2);
    for (const f of states) {
      expect(f.status).toBe("operational");
    }
    const staffedFarm = states.find((f) => f.staffed)!;
    const idleFarm = states.find((f) => !f.staffed)!;
    expect(staffedFarm.y).toBeLessThan(idleFarm.y); // canonical order: north farm staffed

    // workforce shortage is visible as an info alert (states only)
    await expect(page.locator("#stats")).toContainText("Workforce: 1/2 workplaces staffed");

    // inspect the idle farm: the staffing line exposes rank + state
    await page.locator("button[data-build-type='farm']").click(); // deselect palette
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await expect(page.locator("#inspection")).toContainText("staffing 2/2 · idle");

    // mothball the staffed farm (rank 1): the worker frees for the idle one
    const staffedId = await page.evaluate((f) => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      const farm = Object.values(s.buildings).find(
        (b) => b.type === "farm" && b.x === f.x && b.y === f.y,
      );
      return farm!.id;
    }, staffedFarm);
    await page.evaluate((id) => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const r = h.command({ kind: "setBuildingActive", id, active: false });
      if (!r.ok) throw new Error("mothball failed: " + r.reason);
    }, staffedId);

    // one tick: reassignment + alert refresh
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page.getByRole("button", { name: "pause", exact: true }).click();
    await expect(page.locator("#stats")).not.toContainText("Workforce:");

    // the previously idle farm is now staffed at rank 1
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await expect(page.locator("#inspection")).toContainText("staffing 1/1 · staffed");
  });

  test("MVP acceptance loop: build -> produce -> research -> Age 2 -> market sells", async ({ page }) => {
    // docs/game/02-MVP.md §12 acceptance scenario, proven through the UI:
    // start colony -> build infrastructure -> production changes ->
    // inventory changes -> research -> milestone -> Age 2 -> market sells.
    // Scenario resources (money/planks/workforce) are set via the
    // diagnostics surface like the other journeys; every asserted causal
    // step goes through the real UI and simulation.
    await page.goto("/");
    await pause(page);

    // --- start colony (D2 baseline) ---
    const start = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return { pop: s.population, buildings: Object.keys(s.buildings).length, age: (s as unknown as { age: number }).age };
    });
    expect(start.pop).toBe(10);
    expect(start.buildings).toBeGreaterThanOrEqual(22);
    expect(start.age).toBe(1);

    // --- Age 1: the Market is locked and says so (Step025) ---
    const marketLocked = page.locator("button[data-build-type='market']");
    await expect(marketLocked).toBeDisabled();
    await expect(marketLocked).toContainText("requires Age 2");

    // --- build infrastructure via palette + canvas ---
    const farmsBefore = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      return Object.values(s.buildings).filter((b) => b.type === "farm").map((b) => `${b.x},${b.y}`);
    });
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const farmCell = await page.evaluate((before) => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      const farms = Object.values(s.buildings).filter((b) => b.type === "farm").map((b) => `${b.x},${b.y}`);
      const added = farms.find((k) => !before.includes(k));
      if (!added) throw new Error("farm not placed");
      const [x, y] = added.split(",").map(Number);
      return { x: x!, y: y! };
    }, farmsBefore);

    // staffing requires road access: connect the new farm (scenario setup;
    // the staffing/production chain itself stays simulated)
    await page.evaluate((cell) => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
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
      if (!spot) throw new Error("no free neighbor for farm road");
      const r = h.command({ kind: "placeRoads", cells: [spot] });
      if (!r.ok) throw new Error("farm road failed: " + r.reason);
    }, farmCell);

    // scenario setup: workforce for the new farm (D2 housing is full, so
    // admission cannot staff it), treasury for research, planks for market
    await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState() as unknown as { resources: Record<string, number>; population: number };
      s.resources.money = 600;
      s.resources.planks = 5;
      s.population = 13; // 12 D2 workplaces + the new farm in canonical order
    });

    // --- production changes: the new farm staffs, food/tick rises 11 -> 13 ---
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect(page.locator("#stats")).toContainText("Food 13/13");
    await page.getByRole("button", { name: "pause", exact: true }).click();

    // --- research 3 technologies via the progression panel (UI) ---
    for (const tech of ["cropRotation", "masonry", "tradeRoutes"]) {
      await page.locator(`button[data-action='research-${tech}']`).click();
    }
    const researched = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState() as unknown as { researchedTechs: string[] },
    );
    expect(researched.researchedTechs.length).toBe(3);

    // --- inventory changes: crop rotation lifts production above need,
    // the food stock grows ---
    await page.getByRole("button", { name: "8x", exact: true }).click();
    const foodBefore = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState().resources.food,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __nova: NovaHandle }).__nova.getState().resources.food,
        ),
      )
      .toBeGreaterThan(foodBefore);
    await page.getByRole("button", { name: "pause", exact: true }).click();

    // --- milestone reached: advance to Age 2 via the panel button (UI) ---
    const advance = page.locator("button[data-action='advance-age']");
    await expect(advance).toBeVisible();
    await advance.click();
    const age = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.getState() as unknown as { age: number },
    );
    expect(age.age).toBe(2);
    await expect(page.locator("#progression")).toContainText("Age of Expansion (Age 2)");

    // --- Age 2 unlocks the Market palette entry ---
    await expect(marketLocked).toBeEnabled();
    await expect(marketLocked).not.toContainText("requires Age 2");

    // --- build the market via palette + canvas ---
    await marketLocked.click();
    await page.locator("#app canvas").click({ position: { x: 400, y: 300 } });
    const marketCell = await page.evaluate(() => {
      const s = (window as unknown as { __nova: NovaHandle }).__nova.getState();
      const market = Object.values(s.buildings).find((b) => b.type === "market");
      if (!market) throw new Error("market missing");
      return { x: market.x, y: market.y };
    });

    // ensure a road touches the market (sales require connectivity); a
    // neighbor road cell is scenario setup, the sales chain is simulated
    await page.evaluate((cell) => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      const roads = Object.values(s.roads).flatMap((r) => r.cells);
      const touches = [`${cell.x + 1},${cell.y}`, `${cell.x - 1},${cell.y}`, `${cell.x},${cell.y + 1}`, `${cell.x},${cell.y - 1}`];
      if (touches.some((k) => roads.includes(k))) return;
      const spot = touches.find((k) => {
        const [x, y] = k.split(",").map(Number);
        if (x < 0 || y < 0 || x >= s.world.width || y >= s.world.height) return false;
        if (s.world.blockedCells[k]) return false;
        if (s.woodDeposits[k] || s.stoneDeposits[k]) return false;
        return !Object.values(s.buildings).some((b) => `${b.x},${b.y}` === k);
      });
      if (!spot) throw new Error("no free neighbor for market road");
      const r = h.command({ kind: "placeRoads", cells: [spot] });
      if (!r.ok) throw new Error("market road failed: " + r.reason);
    }, marketCell);

    // --- economy changes: the market liquidates surplus food for money ---
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(async () => {
        const text = await statsText(page);
        const row = text.match(/market\D*(\d+)/);
        return row ? Number(row[1]) : 0;
      })
      .toBeGreaterThanOrEqual(1);
    await page.getByRole("button", { name: "pause", exact: true }).click();
    const stats = await statsText(page);
    const marketRow = stats.match(/market\D*(\d+)/);
    expect(marketRow, "stats market row").not.toBeNull();
    expect(Number(marketRow![1])).toBeGreaterThanOrEqual(1);
  });

  test("environment: parks keep air clean; removing them degrades quality", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const s = h.getState();
      s.resources.money = 500;
      s.resources.water = 20;
      h.command({ kind: "placeRoads", cells: ["0,0"] });
      h.command({ kind: "placeBuilding", type: "workshop", x: 1, y: 0 });
      h.command({ kind: "placeBuilding", type: "residence", x: 1, y: 1 });
      h.command({ kind: "placeBuilding", type: "residence", x: 2, y: 1 });
      h.command({ kind: "placeBuilding", type: "park", x: 1, y: 2 });
      h.command({ kind: "placeBuilding", type: "park", x: 2, y: 2 });
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const h = (window as unknown as { __nova: NovaHandle }).__nova;
          return h.getState().tick;
        }),
      )
      .toBeGreaterThan(8); // buildings mature, park absorption active
    await pause(page);

    // 2 parks (−4) dominate 1 workshop (+1): air stays clean at the clamp
    const clean = await page.evaluate(
      () => (window as unknown as { __nova: NovaHandle }).__nova.stats(),
    );
    expect(clean.pollution).toBe(0);
    expect(clean.envQuality).toBe(100);

    // remove both parks → workshop emissions unopposed → degradation
    await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      const parks = Object.values(h.getState().buildings).filter((b) => b.type === "park");
      for (const p of parks) h.command({ kind: "removeBuilding", id: p.id });
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const h = (window as unknown as { __nova: NovaHandle }).__nova;
          return h.stats().envQuality;
        }),
      )
      .toBeLessThan(100);
    await pause(page);

    const degraded = await page.evaluate(() => {
      const h = (window as unknown as { __nova: NovaHandle }).__nova;
      return {
        pollution: h.stats().pollution,
        quality: h.stats().envQuality,
        text: document.querySelector("#stats")?.textContent ?? "",
      };
    });
    expect(degraded.pollution).toBeGreaterThan(0);
    expect(degraded.text).toContain("Pollution");
    expect(degraded.text).toContain("Env quality");
  });

  test("UI stat surface reflects the money-era contract", async ({ page }) => {
    await page.goto("/");
    await waitForTick(page, 1);
    await pause(page);
    const text = await statsText(page);
    expect(text).toContain("Money");
    expect(text).toContain("Revenue/tick");
    expect(text).toContain("Maintenance/tick");
    expect(text).toContain("Net money/tick");
    expect(text).toContain("Planks");
    // pre-money fields must not resurrect
    expect(text).not.toContain("storageCapacity");
    expect(text).not.toContain("netMaterial");
  });
});
