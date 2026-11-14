import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { emptyTickFlows, stepSimulation, stepTicks } from "@/domain/simulation/tick.js";
import { foodCapacity } from "@/domain/storage/storage.js";
import { foodEquilibriumStock, projectFoodTick } from "@/domain/storage/spoilage.js";
import {
  FOOD_RESERVE_TICKS,
  foodReserveStatus,
  foodSustainablePopulation,
} from "@/domain/storage/reserve.js";
import { getResourceSummaries } from "@/application/queries/analysis.js";
import { saveToString } from "@/application/persistence/save.js";
import { run } from "../tools/agent/play.js";
import { mustOk, stripToAnchor, freeCell, adjacentFree } from "./helpers.js";
import type { WorldConfig } from "@/domain/world/world.js";

/**
 * Step069 — the cockpit's food forecast against the simulation.
 *
 * The cockpit is not allowed a second doctrine: these tests pin that every
 * number it shows is the tick's own arithmetic (production → conservation →
 * consumption → storage cap), that the Step068 target comes from `reserve.ts`,
 * and that the projection reproduces the real tick exactly — same stock, same
 * production, same eating, same losses, same waste.
 */

const CONFIG: WorldConfig = {
  seed: "cockpit-forecast",
  // 20×20: this seed's terrain blocks enough of a 16×16 map to leave no room
  // for the shipped D2 road ring.
  width: 20,
  height: 20,
  woodDeposits: [{ x: 5, y: 5, amount: 60 }],
  stoneDeposits: [{ x: 10, y: 10, amount: 60 }],
};

interface ColonySpec {
  population: number;
  farms: number;
  /** Wells, for the tests that need water out of the binding position. */
  wells?: number;
  /** Residences (1 housing each): the anchor houses nobody on its own. */
  residences?: number;
  techs?: string[];
  food?: number;
  water?: number;
}

/**
 * Anchor-only colony with `farms` staffed farms and no housing (admission is
 * off). Staffing is assigned at the end of a tick, so the population is set
 * before one tick is run and re-pinned after it: the caller reads the steady
 * state, not the tick that built it.
 */
function colony(spec: ColonySpec): GameState {
  const state = createInitialState(CONFIG);
  stripToAnchor(state);
  state.eventsEnabled = false; // the forecast measures the law, not a windfall
  state.researchedTechs = [...(spec.techs ?? [])];
  state.resources.money = 1000;
  state.resources.water = spec.water ?? 400;
  state.resources.food = 60;
  for (const [type, count] of [
    ["residence", spec.residences ?? 0],
    ["well", spec.wells ?? 0],
    ["farm", spec.farms],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const spot = freeCell(state);
      const road = adjacentFree(state, spot.x, spot.y);
      mustOk(applyCommand(state, { kind: "placeRoads", cells: [`${road.x},${road.y}`] }));
      mustOk(applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }));
    }
  }
  stepTicks(state, 3); // construction done
  state.population = spec.population;
  stepTicks(state, 1); // staffing follows the population
  state.population = spec.population; // re-pin: a hungry tick may have moved it
  state.resources.food = spec.food ?? 60;
  state.resources.water = spec.water ?? 400;
  state.foodSpoilCarry = 0;
  return state;
}

describe("cockpit forecast — the tick's own arithmetic", () => {
  it("production funding the target is reported with its reserve and autonomy", () => {
    const state = colony({ population: 16, farms: 6, techs: ["cropRotation"] });
    const food = getResourceSummaries(state).food;
    const reserve = food.reserve!;
    expect(reserve.target).toBe(16 * FOOD_RESERVE_TICKS);
    // the Step068 reference: 19 food settles at 81 units = 5.06 ticks
    expect(reserve.equilibrium).toBe(81);
    expect(reserve.equilibrium / reserve.consumptionPerTick).toBeGreaterThanOrEqual(5);
    expect(reserve.status).toBe("building"); // stock still below the target
    expect(food.ticksRemaining).toBeNull(); // never empties at this production
    expect(food.netPerTick).toBeGreaterThan(0);
  });

  it("insufficient production stays a deficit even with a full granary", () => {
    // 4 farms = 13 food for 16 mouths: a big stock only delays the emptying.
    const state = colony({ population: 16, farms: 4, food: 110 });
    const food = getResourceSummaries(state).food;
    expect(food.stock).toBe(110);
    expect(food.reserve?.status).toBe("deficit");
    expect(food.ticksRemaining).not.toBeNull();
    expect(food.ticksRemaining).toBeGreaterThan(10); // it holds a while...
    expect(food.netPerTick).toBeLessThan(0); // ...but it is going down
  });





});

describe("cockpit forecast — capacity ceiling (sustainable population)", () => {
  it("funds the resident the boundary supports exactly, and no more", () => {
    // Capacity-bound: 50 units is exactly 5 ticks of consumption for 10
    // colonists, so the boundary funds them — equality is inside the claim,
    // because at that stock the granary still holds the full target.
    expect(foodSustainablePopulation(1000, 50)).toBe(10);
    expect(foodSustainablePopulation(1000, 49)).toBe(9); // a unit short

    // The measured Step069 case: 19 food/tick funds 16 colonists, not the 19
    // that `floor(production)` credits — the 3% loss eats the difference.
    expect(foodSustainablePopulation(19, 1000)).toBe(16);
  });

  it("classifies the five states without inventing a sixth", () => {
    const base = { stock: 100, equilibrium: 100, target: 80, capacityShort: false };
    expect(foodReserveStatus({ ...base, equilibrium: 0 })).toBe("deficit");
    expect(foodReserveStatus({ ...base, equilibrium: -5 })).toBe("deficit");
    expect(foodReserveStatus({ ...base, capacityShort: true })).toBe("storage-limited");
    expect(foodReserveStatus({ ...base, stock: 60 })).toBe("building");
    expect(foodReserveStatus(base)).toBe("funded");
    expect(foodReserveStatus({ ...base, equilibrium: 40 })).toBe("thin");
    // a deficit outranks a storage limit: a full granary that drains is not a
    // capacity problem
    expect(foodReserveStatus({ ...base, equilibrium: 0, capacityShort: true })).toBe("deficit");
  });
});

describe("cockpit forecast — agreement with the simulation", () => {
  /**
   * Runs the projection and the simulation side by side, tick by tick: the
   * projection is read BEFORE the tick, the tick then has to land exactly on
   * it, and the totals must add up.
   */
  function agreement(spec: ColonySpec, ticks: number) {
    const state = colony(spec);
    const population = state.population;
    const start = state.resources.food;
    const flows = emptyTickFlows();
    const projected = { production: 0, eaten: 0, spoiled: 0, wasted: 0 };
    const real = { production: 0, eaten: 0, spoiled: 0, wasted: 0 };
    const firstTick = projectFoodTick(state);
    for (let i = 0; i < ticks; i++) {
      state.population = population;
      const tick = projectFoodTick(state);
      projected.production += tick.production;
      projected.eaten += tick.eaten;
      projected.spoiled += tick.spoiled;
      projected.wasted += tick.wasted;
      // the pipeline measures its own moves as stock deltas, one tick at a time
      stepSimulation(state, flows);
      real.production += flows.foodProduced;
      real.eaten += flows.foodConsumed;
      real.spoiled += flows.foodSpoiled;
      real.wasted += flows.foodWasted;
      // per tick: the projection's stock IS the simulation's stock
      expect(state.resources.food, `tick ${i + 1}`).toBe(tick.stock);
    }
    return {
      forecast: getResourceSummaries(colony(spec)).food,
      firstTick,
      projected,
      real,
      start,
      end: state.resources.food,
    };
  }

  it("matches the real tick, funded, deficit and saturating alike", () => {
    // funded: the reserve climbs to its equilibrium and nothing empties
    const funded = agreement({ population: 16, farms: 6, techs: ["cropRotation"], food: 40 }, 200);
    expect(funded.real).toEqual(funded.projected);
    expect(funded.forecast.productionPerTick).toBe(funded.firstTick.production);
    expect(funded.forecast.consumptionPerTick).toBe(16);
    expect(funded.forecast.spoilagePerTick).toBe(funded.firstTick.spoiled);
    expect(funded.forecast.netPerTick).toBe(funded.firstTick.net);
    expect(funded.forecast.ticksRemaining).toBeNull();
    expect(funded.end).toBeGreaterThan(funded.start);
    // the doctrine's claim, verified: 19 food for 16 colonists settles at 81
    const steady = Math.round(foodEquilibriumStock(16, 19));
    expect(funded.forecast.reserve?.equilibrium).toBe(steady);
    expect(funded.end).toBeGreaterThanOrEqual(Math.floor(steady) - 1);
    expect(funded.end).toBeLessThanOrEqual(Math.ceil(steady) + 1);

    // deficit: the announced countdown is the tick that really empties it
    const spec: ColonySpec = { population: 19, farms: 6, techs: ["cropRotation"], food: 58 };
    const deficit = agreement(spec, 40);
    expect(deficit.real).toEqual(deficit.projected);
    expect(deficit.forecast.reserve?.status).toBe("deficit");
    const countdown = deficit.forecast.ticksRemaining;
    expect(countdown).not.toBeNull();
    expect(deficit.end).toBeLessThan(deficit.start);
    const state = colony(spec);
    const pinned = state.population;
    let emptiedAt: number | null = null;
    for (let i = 1; i <= 500 && emptiedAt === null; i++) {
      state.population = pinned;
      stepSimulation(state);
      if (state.resources.food === 0) emptiedAt = i;
    }
    expect(emptiedAt).toBe(countdown);

    // saturating: the storage cap is part of the law, waste included
    const full = agreement({ population: 4, farms: 6, techs: ["cropRotation"], food: 100 }, 30);
    expect(full.real).toEqual(full.projected);
    expect(full.real.wasted).toBeGreaterThan(0);
    expect(full.end).toBe(foodCapacity(colony({ population: 4, farms: 6 })));
    expect(full.forecast.reserve?.status).toBe("funded");

    // starving: the need is capped by the stock, so the projection eats what
    // the granary holds, never what the population implies (6 + the Center's
    // 1 trickle for 16 mouths)
    const starving = agreement({ population: 16, farms: 0, food: 6 }, 5);
    expect(starving.real).toEqual(starving.projected);
    expect(starving.firstTick.eaten).toBeLessThan(16);
    expect(starving.firstTick.eaten).toBeLessThanOrEqual(6 + starving.firstTick.production);
    expect(starving.end).toBe(0);
  });

});

/** Runs the real `assess` CLI over a saved state and returns its reading. */
async function cockpitAssess(state: GameState): Promise<Record<string, unknown>> {
  const saved: string[] = [];
  const original = console.log;
  console.log = (line: unknown) => saved.push(String(line));
  try {
    await run({
      argv: ["--json"],
      input: [JSON.stringify({ cmd: "load", path: "mem" }), JSON.stringify({ cmd: "assess" })].join("\n"),
      readFile: () => saveToString(state),
      writeFile: () => {},
    });
  } finally {
    console.log = original;
  }
  const reply = saved
    .map((line) => JSON.parse(line) as { ok: boolean; text?: string; data?: Record<string, unknown> })
    .find((r) => r.data && "verdict" in r.data);
  if (!reply || !reply.data) throw new Error(`assess produced no verdict: ${saved.join("\n")}`);
  return { ...reply.data, text: reply.text };
}

describe("cockpit forecast — the admission gate", () => {
  it("no frozen colony reads healthy, and the reason names the gate", async () => {
    // full housing under dead air: nothing else is wrong, and the housing is
    // already full, so no "growth blocked" warning is available to carry it
    const frozen = colony({ population: 4, wells: 2, farms: 2, residences: 4 });
    frozen.pollution = 80;
    const reading = await cockpitAssess(frozen);
    expect(reading.verdict).not.toBe("healthy");
    expect(reading.reasons).toContain(
      "growth frozen: air quality 20 < admission threshold 25",
    );
    expect(reading.admission).toMatchObject({ blocked: true, quality: 20, threshold: 25 });
    expect(String(reading.text)).toContain("admission frozen (air quality 20 < 25)");

    // the invariant, not one branch: the verdict may lose the warning alert
    // (threshold or severity changed) and must still refuse to call a frozen
    // colony healthy. (An empty colony is exempt — bootstrap — and reads
    // critical for being empty.)
    for (const state of [frozen, colony({ population: 10, farms: 4 })]) {
      state.pollution = 90;
      const gateReading = await cockpitAssess(state);
      expect(gateReading.admission).toMatchObject({ blocked: true });
      expect(gateReading.verdict).not.toBe("healthy");
    }

    // a warning keeps its weight: the gate never softens a critical
    const famine = colony({ population: 10, farms: 4 });
    famine.pollution = 80;
    const critical = await cockpitAssess(famine);
    expect(critical.verdict).toBe("critical");
    expect(critical.reasons).toContain(
      "growth frozen: air quality 20 < admission threshold 25",
    );
  });
});
