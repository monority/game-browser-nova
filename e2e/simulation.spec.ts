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

    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page
      .waitForFunction(
        () =>
          window.__nova!.getState().population >= 5,
        undefined,
        { timeout: 45_000 },
      )
      .catch(() => {});
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
    expect(final.population).toBeGreaterThanOrEqual(5);
    expect(final.population).toBeLessThanOrEqual(final.housing);
    expect(final.food).toBeGreaterThan(0); // sustained, not starving
  });
  test("environment: parks keep air clean; removing them degrades quality", async ({ page }) => {
    await page.goto("/");
    await pause(page);

    // Step064: an emitter only pollutes while STAFFED, so the scenario needs a
    // workshop that is really staffed, on a cell that is really free (the old
    // fixed coordinates were already occupied, and the spec leaned on the
    // shipped colony's idling workshops for its emissions).
    const built = await page.evaluate(() => {
      const h = window.__nova!;
      const s = h.getState();
      s.resources.money = 500;
      s.resources.water = 40;
      s.population = 14; // more colonists than workplaces: every one is staffed
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

      // three parks: −6/tick, more than the three staffed workshops' +3
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

    // 3 parks (−6) dominate the three staffed workshops (+3): air stays clean
    const clean = await page.evaluate(
      () => window.__nova!.stats(),
    );
    expect(clean.pollution).toBe(0);
    expect(clean.envQuality).toBe(100);

    // remove both parks → workshop emissions unopposed → degradation
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
