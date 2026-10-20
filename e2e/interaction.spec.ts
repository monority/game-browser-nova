import { expect, test } from "@playwright/test";
import { pause, stripToAnchor, waitForTick } from "./helpers.js";

test.describe("NOVA interaction flows", () => {
  test("save and load round-trip through the UI", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    await page.locator("button[data-build-type='residence']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await page.locator("button[data-action='save']").click();

    const savedMoney = await page.evaluate(
      () => window.__nova!.getState().resources.money,
    );

    const savedFarms = await page.evaluate(() =>
      Object.values(window.__nova!.getState().buildings).filter((b) => b.type === "farm").length,
    );
    // mutate: place another building to change money
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 700, y: 300 } });
    const mutated = await page.evaluate(
      () => window.__nova!.getState(),
    );
    expect(mutated.resources.money).toBe(savedMoney - 25);

    // load restores the saved colony
    await page.locator("button[data-action='load']").click();
    await expect(page.locator("#ui")).toContainText("Colony loaded.");
    const loaded = await page.evaluate(() => {
      const state = window.__nova!.getState();
      return {
        money: state.resources.money,
        farms: Object.values(state.buildings).filter((b) => b.type === "farm").length,
      };
    });
    expect(loaded.money).toBe(savedMoney);
    expect(loaded.farms).toBe(savedFarms);
  });

  test("load keeps the active overlay coherent (Step039)", async ({ page }) => {
    // The UI keeps its overlay selection across a load while the fresh
    // renderer boots with "none" — scene and UI must not diverge.
    await page.goto("/");
    await pause(page);
    await page.locator("button[data-action='overlay-staffing']").click();
    await expect(page.locator("button[data-action='overlay-staffing']")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(await page.evaluate(() => window.__nova!.overlay())).toBe("staffing");

    // save -> load: a brand-new renderer replaces the scene
    await page.locator("button[data-action='save']").click();
    await expect(page.locator(".nova-status")).toHaveText("Colony saved.");
    await page.locator("button[data-action='load']").click();
    await expect(page.locator(".nova-status")).toHaveText("Colony loaded.");

    // UI marker survived AND the scene kept the overlay (the Step039 fix)
    await expect(page.locator("button[data-action='overlay-staffing']")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(await page.evaluate(() => window.__nova!.overlay())).toBe("staffing");

    // the toggle still works after load (no stale mirror)
    await page.locator("button[data-action='overlay-none']").click();
    expect(await page.evaluate(() => window.__nova!.overlay())).toBe("none");
    await expect(page.locator("button[data-action='overlay-staffing']")).not.toHaveAttribute(
      "data-active",
      "true",
    );
  });
  test("removal flow: place ? inspect ? remove ? cell and stats restored", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // D2 baseline maintenance for the delta assertions below
    const base = await page.evaluate(
      () => window.__nova!.stats().maintenancePerTick,
    );

    // place a farm (no refund policy: money stays spent)
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    const placed = await page.evaluate(() => {
      const s = window.__nova!.getState();
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
          () => window.__nova!.stats().maintenancePerTick,
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
      () => window.__nova!.getState().resources.money,
    );
    await removeButton.click();
    const afterRemove = await page.evaluate(() => {
      const s = window.__nova!.getState();
      const stats = window.__nova!.stats();
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
      const s = window.__nova!.getState();
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
      () => window.__nova!.stats().maintenancePerTick,
    );

    // place + mature a farm (residences are upkeep-exempt; farms show the drop)
    await page.locator("button[data-build-type='farm']").click();
    await page.locator("#app canvas").click({ position: { x: 300, y: 400 } });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__nova!.stats().maintenancePerTick,
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
      const s = window.__nova!.getState();
      const ids = Object.values(s.buildings)
        .filter((b) => b.type === "farm")
        .map((b) => Number(b.id.replace("building-", "")));
      return `building-${Math.max(...ids)}`;
    });
    const afterDeactivate = await page.evaluate((farmId: string) => {
      const h = window.__nova!;
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
      const h = window.__nova!;
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
  test("analysis surfaces: forecast + alerts reflect the colony state", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // isolate the forecast math from the D2 colony via real commands
    await stripToAnchor(page);
    await page.evaluate(() => {
      window.__nova!.getState().population = 0;
    });
    // build farm + residence programmatically, mature them
    await page.evaluate(() => {
      const h = window.__nova!;
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
            window.__nova!.getState().population,
        ),
      )
      .toBe(1);
    await pause(page);

    // balanced colony: food +2/tick (farm 2 + Center trickle 1 − pop 1), no countdown
    const balanced = await page.evaluate(() => {
      const h = window.__nova!;
      return { stats: h.stats().resources, text: document.querySelector("#stats")?.textContent ?? "" };
    });
    expect(balanced.text).toContain("Forecast");
    expect(balanced.text).toContain("Food 3/1");
    expect(balanced.text).not.toContain("ticks"); // no countdown at +2/tick

    // mothball the farm → only the trickle (1) vs pop 1: balance 0, still no deficit.
    // Add a second colonist: consumption 2 vs trickle 1 → deficit −1 → countdown
    await page.evaluate(() => {
      const h = window.__nova!;
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
      () => window.__nova!.getState().tick,
    );
    await page.waitForTimeout(1200);
    expect(
      await page.evaluate(
        () => window.__nova!.getState().tick,
      ),
    ).toBe(pausedTick);

    // Space again → resume at last speed; the tick advances again
    await page.keyboard.press("Space");
    await waitForTick(page, pausedTick + 2);

    // digit 8 → 8x: many ticks in a short window
    await page.keyboard.press("8");
    const before8 = await page.evaluate(
      () => window.__nova!.getState().tick,
    );
    await page.waitForTimeout(1500);
    await pause(page);
    const after8 = await page.evaluate(
      () => window.__nova!.getState().tick,
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
      const h = window.__nova!;
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
            window.__nova!.getState().population,
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
      const s = window.__nova!.getState();
      const farms = Object.values(s.buildings).filter((b) => b.type === "farm");
      if (farms.length !== 1) throw new Error("expected exactly one farm");
      return { x: farms[0]!.x, y: farms[0]!.y };
    });

    // road north of A, farm B north of the road: B ranks ahead of A
    await page.evaluate((a) => {
      const h = window.__nova!;
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
          const s = window.__nova!.getState();
          return Object.values(s.buildings).filter((b) => b.type === "farm" && b.status === "operational").length;
        }),
      )
      .toBe(2);
    await page.getByRole("button", { name: "pause", exact: true }).click();

    // both farms operational and B (rank 1) staffed, A (rank 2) idle
    const states = await page.evaluate(() => {
      const s = window.__nova!.getState();
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
      const s = window.__nova!.getState();
      const farm = Object.values(s.buildings).find(
        (b) => b.type === "farm" && b.x === f.x && b.y === f.y,
      );
      return farm!.id;
    }, staffedFarm);
    await page.evaluate((id) => {
      const h = window.__nova!;
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
  test("renderer disposes rebuilt meshes: geometry count stays flat across ticks", async ({ page }) => {
    // Step027 regression: rebuildGroup must dispose old meshes before
    // rebuilding; a leak shows as geometries growing with updateCount.
    await page.goto("/");
    await pause(page);
    await page.waitForTimeout(300);

    const before = await page.evaluate(
      () => window.__nova!.perf(),
    );
    expect(before.updateCount).toBeGreaterThan(0);
    expect(before.geometries).toBeGreaterThan(0);

    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page.waitForTimeout(2000); // ~30 rebuilds at 8x
    await page.getByRole("button", { name: "pause", exact: true }).click();

    const after = await page.evaluate(
      () => window.__nova!.perf(),
    );
    expect(after.updateCount).toBeGreaterThan(before.updateCount + 20);
    // steady-state: geometries track scene contents (≈ draw calls), not ticks
    expect(after.geometries).toBeLessThanOrEqual(before.geometries + 10);
    // rebuild cost stays trivial vs the 62.5ms/tick budget at 8x
    expect(after.avgUpdateMs).toBeLessThan(10);
  });
});
