import { expect, test } from "@playwright/test";
import { pause } from "./helpers.js";

test.describe("NOVA simulation", () => {
  test("healthy growth: deterministic colony reaches 5 inhabitants", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // programmatic deterministic build via the diagnostics command surface:
    // 6-long road strip, workplaces in canonical staffing order, 6 residences
    // elsewhere. Farms rank ahead of wells: post-D2 the colony starts at
    // pop 10 with exact water balance, so FOOD is the survival gate —
    // housing built ahead of food production starves the colony (Step025).
    const built = await page.evaluate(() => {
      const h = window.__nova!;
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

    // Growth is the claim, so it is measured from the paused start: the shipped
    // D2 opening already holds 10 colonists, which made the old `>= 5` wait
    // resolve before the first tick (measured 2026-11-17 — the colony then grew
    // 10 -> 13, but a stall at 10 would have passed the same assertion).
    const startPopulation = await page.evaluate(() => window.__nova!.getState().population);
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page
      .waitForFunction(
        (start) => window.__nova!.getState().population > start,
        startPopulation,
        { timeout: 45_000 },
      )
      .catch(() => {}); // fall through to the assertions, which carry the numbers
    await pause(page);

    const final = await page.evaluate(() => {
      const h = window.__nova!;
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
    // AND that the colony actually grew from where it started
    expect(final.population).toBeGreaterThan(startPopulation);
    expect(final.population).toBeGreaterThanOrEqual(5);
    expect(final.population).toBeLessThanOrEqual(final.housing);
    expect(final.food).toBeGreaterThan(0); // sustained, not starving
  });
  test("environment: parks keep air clean; removing them degrades quality", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // Step083 moved emission onto ACTIVITY: an active workshop pollutes whether
    // or not anyone tends it, which is why the shipped opening's two idle shops
    // now need its park. Staffing still decides the food and water that keep 16
    // colonists alive, hence the farm and the three wells below; the workshop
    // itself only needs a free cell (the old fixed coordinates were occupied).
    const built = await page.evaluate(() => {
      const h = window.__nova!;
      const s = h.getState();
      s.resources.money = 500;
      s.resources.water = 80;
      s.resources.food = 120;
      s.population = 16; // more colonists than workplaces: every one is staffed
      const key = (x: number, y: number) => `${x},${y}`;
      const roads = Object.values(s.roads).flatMap((r) => r.cells);
      const free = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= s.world.width || y >= s.world.height) return false;
        const k = key(x, y);
        if (s.world.blockedCells[k] || s.woodDeposits[k] || s.stoneDeposits[k]) return false;
        if (roads.includes(k)) return false;
        return !Object.values(s.buildings).some((b) => b.x === x && b.y === y);
      };
      const sides = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const;

      // Step068: the fixture must FEED the population it forces. Conservation
      // (3%/tick) has no fixed point at an exact balance, so the old 5 farms
      // (11 food/tick) for 14 colonists starved the colony, one colonist per
      // tick, and starvation unstaffs the very workshops this test needs
      // staffed to observe pollution. cropRotation (3 food/farm) plus one more
      // farm gives 19 for 16 mouths (equilibrium ~81), three more wells cover
      // the water — the environment system is then isolated from the famine.
      h.command({ kind: "researchTech", techId: "cropRotation" });
      const buildBesideRoad = (type: "farm" | "well"): boolean => {
        const rs = new Set(Object.values(s.roads).flatMap((r) => r.cells));
        for (let y = 0; y < s.world.height; y++) {
          for (let x = 0; x < s.world.width; x++) {
            if (!free(x, y)) continue;
            const near = sides.some(([dx, dy]) => rs.has(key(x + dx, y + dy)));
            if (!near) continue;
            if (h.command({ kind: "placeBuilding", type, x, y }).ok) return true;
          }
        }
        return false;
      };
      if (!buildBesideRoad("farm")) return { ok: false, reason: "no farm site" };
      for (let i = 0; i < 3; i++) {
        if (!buildBesideRoad("well")) return { ok: false, reason: "no well site" };
      }

      // a road cell with one free neighbour beside it, for the workshop
      let site: { x: number; y: number; nx: number; ny: number } | null = null;
      for (let y = 0; y < s.world.height && !site; y++) {
        for (let x = 0; x < s.world.width && !site; x++) {
          if (!free(x, y)) continue;
          const nb = sides.find(([dx, dy]) => free(x + dx, y + dy));
          if (nb) site = { x, y, nx: x + nb[0], ny: y + nb[1] };
        }
      }
      if (!site) return { ok: false, reason: "no free road+workshop site" };
      h.command({ kind: "placeRoads", cells: [key(site.x, site.y)] });
      const workshop = h.command({
        kind: "placeBuilding",
        type: "workshop",
        x: site.nx,
        y: site.ny,
      });
      if (!workshop.ok) return { ok: false, reason: workshop.reason };

      // three parks here (−6/tick) on top of the shipped D2 park (−2), against
      // the three active workshops (+3): net −5 while all four stand
      let parks = 0;
      for (let y = 0; y < s.world.height && parks < 3; y++) {
        for (let x = 0; x < s.world.width && parks < 3; x++) {
          if (!free(x, y)) continue;
          if (h.command({ kind: "placeBuilding", type: "park", x, y }).ok) parks++;
        }
      }
      return { ok: parks === 3, parks };
    });
    expect(built.ok).toBe(true);
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const h = window.__nova!;
          return h.getState().tick;
        }),
      )
      .toBeGreaterThan(8); // buildings mature, park absorption active
    await pause(page);

    // 4 parks (−8: these three plus the shipped one) dominate the three active
    // workshops (+3): air stays clean
    const clean = await page.evaluate(
      () => window.__nova!.stats(),
    );
    expect(clean.pollution).toBe(0);
    expect(clean.envQuality).toBe(100);

    // remove every park — the filter takes the shipped one too → emissions
    // unopposed → degradation
    await page.evaluate(() => {
      const h = window.__nova!;
      const parks = Object.values(h.getState().buildings).filter((b) => b.type === "park");
      for (const p of parks) h.command({ kind: "removeBuilding", id: p.id });
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const h = window.__nova!;
          return h.stats().envQuality;
        }),
      )
      .toBeLessThan(100);
    await pause(page);

    const degraded = await page.evaluate(() => {
      const h = window.__nova!;
      return {
        pollution: h.stats().pollution,
        quality: h.stats().envQuality,
        text: document.querySelector("#stats")?.textContent ?? "",
      };
    });
    expect(degraded.pollution).toBeGreaterThan(0);
    expect(degraded.text).toContain("Pollution");
    expect(degraded.text).toContain("Env quality");
    // Step056 F1: the crisis carries a deadline, not only a stock. At 8x the
    // gate may already be shut, so 0 ("blocked now") is a valid deadline too.
    expect(degraded.text).toContain("admission block");
    const blockTicks = await page.evaluate(
      () => window.__nova!.stats().pollutionTicksToAdmissionBlock,
    );
    expect(blockTicks).not.toBeNull();
    expect(blockTicks).toBeGreaterThanOrEqual(0);
  });
});
