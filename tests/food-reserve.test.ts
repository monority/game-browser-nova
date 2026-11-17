import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { FOOD_PER_COLONY_CENTER_PER_TICK, foodPerFarm } from "@/domain/production/production.js";
import { planFoodReserve, forecastFoodReserve, FOOD_RESERVE_TICKS } from "@/domain/storage/reserve.js";
import { foodEquilibriumStock } from "@/domain/storage/spoilage.js";
import { foodCapacity } from "@/domain/storage/storage.js";
import { mustOk, stripToAnchor, freeCell, adjacentFree } from "./helpers.js";
import type { WorldConfig } from "@/domain/world/world.js";

/**
 * Step068 food reserve doctrine (src/domain/storage/reserve.ts).
 *
 * Step056 sized farms to the exact balance; with the 3%/tick conservation of
 * Step067 that law's fixed point is zero, so the colony starves at the
 * boundary (measured on the shipped journeys, 2026-11-13). These tests pin the
 * replacement: production must cover consumption PLUS conservation PLUS a
 * reserve, and the real tick must actually reach it.
 */

const CONFIG: WorldConfig = {
  seed: "food-reserve",
  width: 16,
  height: 16,
  woodDeposits: [{ x: 5, y: 5, amount: 60 }],
  stoneDeposits: [{ x: 10, y: 10, amount: 60 }],
};

/**
 * A colony stripped to the anchor, with exactly `farms` staffed farms and the
 * population pinned by the caller (housing stays 0, so admission cannot grow
 * it — the question here is food, not growth).
 */
function colony(population: number, farms: number, techs: string[] = []): GameState {
  const state = createInitialState(CONFIG);
  stripToAnchor(state);
  state.researchedTechs = [...techs];
  state.resources.money = 1000;
  state.resources.water = 200;
  state.resources.food = 60;
  for (let i = 0; i < farms; i++) {
    const spot = freeCell(state);
    const road = adjacentFree(state, spot.x, spot.y);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [`${road.x},${road.y}`] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: spot.x, y: spot.y }));
  }
  // construction takes 2 ticks; the population is set after they exist so the
  // first ticks do not starve it
  stepTicks(state, 3);
  state.population = population;
  return state;
}

/** Adds `count` road-connected residences so admission can grow the colony. */
function withResidences(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    const spot = freeCell(state);
    const road = adjacentFree(state, spot.x, spot.y);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [`${road.x},${road.y}`] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
  }
  stepTicks(state, 3);
}

/**
 * The farm count the doctrine must pick: the SMALLEST equilibrium that reaches
 * the target without overflowing the granary ("over-reserve is the safe side,
 * but the first count that reaches the target wins"). Null when no count
 * inside the cap reaches it — the plan then stays below, on purpose.
 */
function smallestAtOrAbove(
  state: GameState,
  plan: ReturnType<typeof planFoodReserve>,
): number | null {
  const yieldPerFarm = foodPerFarm(state);
  const ceiling = foodCapacity(state) - 1; // one unit of headroom, as the plan
  for (let farms = 0; farms <= plan.farms + 8; farms++) {
    const production = FOOD_PER_COLONY_CENTER_PER_TICK + farms * yieldPerFarm;
    const equilibrium = foodEquilibriumStock(state.population, production);
    if (equilibrium > ceiling) break; // monotone: nothing higher fits either
    if (equilibrium >= plan.target) return farms;
  }
  return null;
}

function minFood(
  state: GameState,
  ticks: number,
): { min: number; max: number; final: number } {
  let min = state.resources.food;
  let max = state.resources.food;
  for (let i = 0; i < ticks; i++) {
    stepTicks(state, 1);
    min = Math.min(min, state.resources.food);
    max = Math.max(max, state.resources.food);
  }
  return { min, max, final: state.resources.food };
}

describe("food reserve doctrine", () => {
  it("never plans production equal to consumption", () => {
    for (const population of [6, 10, 12, 16, 18, 22, 24]) {
      for (const techs of [[], ["cropRotation"], ["cropRotation", "irrigation"]]) {
        const state = createInitialState(CONFIG);
        state.population = population;
        state.researchedTechs = techs;
        const plan = planFoodReserve(state);
        const yieldPerFarm = foodPerFarm(state);
        // The old law, for the record: ceil(pop / yield) farms.
        const exactFarms = Math.max(1, Math.ceil(population / yieldPerFarm));
        const exactProduction = 1 + exactFarms * yieldPerFarm;
        expect(exactProduction).toBeGreaterThanOrEqual(population); // it did feed them...
        expect(plan.production).toBeGreaterThan(population); // ...but this plan also spoils
        expect(plan.equilibrium).toBeGreaterThan(0);
        expect(plan.autonomy).toBeGreaterThan(0);

        // Which count, not just "some count": the first equilibrium at or
        // above the target, never the largest one the granary could hold.
        // (Mutation F7 — preferring the nearest under-target reserve, or the
        // far side of the target — survived the whole suite before this.)
        const expectedFarms = smallestAtOrAbove(state, plan);
        const where = `${population} pop · ${techs.join("+") || "no tech"}`;
        if (expectedFarms !== null) {
          expect(plan.farms, where).toBe(expectedFarms);
          expect(plan.equilibrium, where).toBeGreaterThanOrEqual(plan.target);
        } else {
          expect(plan.equilibrium, where).toBeLessThan(plan.target);
        }
      }
    }

    // The requested production holds the target EXACTLY at equilibrium: that
    // is what the spoilage denominator buys (P(R) = (pop + r·R) / (1 − r)).
    // Dropping it — a 3 % error, easy to miss — lands the steady stock at 62
    // where the doctrine promised 80, so the check is on the law, not on P.
    const forecast = forecastFoodReserve(colony(16, 0));
    expect(forecast.target).toBe(80);
    expect(foodEquilibriumStock(16, forecast.productionForTarget)).toBeCloseTo(80, 6);
  });

  it("holds the target reserve in the real tick (pop 16, cropRotation)", () => {
    const state = colony(16, 6, ["cropRotation"]);
    const plan = planFoodReserve(state);
    expect(plan.farms).toBe(6);
    expect(plan.equilibrium).toBeCloseTo(81, 0);
    const { min, max } = minFood(state, 600);
    // Step070: six hundred ticks span ten seasons, so the stock is a sawtooth —
    // winter parks the surplus farms and conservation takes its share, spring
    // refills toward the predicted equilibrium. What the season may not do is
    // starve the colony or keep it out of the reserve band: the peak stays close
    // to the 80-unit target and the trough never comes near zero.
    expect(max).toBeGreaterThan(plan.target * 0.8);
    expect(min).toBeGreaterThan(20);
  });

  it("asks for storage when the target reserve cannot fit", () => {
    // pop 42 needs a 210-unit reserve; the base granary is 180 (Step070, three
    // day-0 stocks), so the target genuinely does not fit.
    const state = createInitialState(CONFIG);
    state.population = 42;
    state.researchedTechs = ["cropRotation", "irrigation"]; // 4 food/farm
    const tight = planFoodReserve(state);
    expect(tight.capacityShort).toBe(true);
    // the granary can only hold the low branch: the target is out of reach
    expect(tight.autonomy).toBeLessThan(FOOD_RESERVE_TICKS);

    // a warehouse (+50/50) opens the high branch, which the doctrine then takes
    state.resources.planks = 5; // the warehouse is industry-gated (Step031)
    const spot = freeCell(state);
    mustOk(
      applyCommand(state, {
        kind: "placeBuilding",
        type: "warehouse",
        x: spot.x,
        y: spot.y,
      }),
    );
    stepTicks(state, 3);
    const roomy = planFoodReserve(state);
    expect(roomy.capacityShort).toBe(false);
    expect(roomy.autonomy).toBeGreaterThan(tight.autonomy);
    expect(roomy.equilibrium).toBeGreaterThan(60);
  });

  it("takes the first count that reaches the target, not the largest one it could hold", () => {
    // pop 16 with cropRotation: one farm moves the equilibrium by 100 units
    // (yield / spoilage rate = 3 / 0.03), so a warehouse makes TWO counts
    // reach the 80-unit target — 81 at 6 farms, 178 at 7. Over-reserve is the
    // safe side, but the doctrine takes the first: the seventh farm's surplus
    // is destroyed at the cap for nothing. (Mutation F7 measured this as
    // unobserved: with the base granary only one candidate fits, so the tie
    // never showed.)
    const state = colony(16, 6, ["cropRotation"]);
    expect(planFoodReserve(state).farms).toBe(6); // base granary: one candidate

    state.resources.planks = 5; // the warehouse is industry-gated (Step031)
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "warehouse", x: spot.x, y: spot.y }));
    stepTicks(state, 3);

    const plan = planFoodReserve(state);
    expect(plan.capacity).toBe(240); // base 180 + one warehouse
    expect(plan.farms).toBe(6);
    expect(plan.equilibrium).toBeCloseTo(81, 0);
    expect(plan.autonomy).toBeGreaterThanOrEqual(FOOD_RESERVE_TICKS);
  });

  it("never plans a reserve sitting on the granary's cap", () => {
    // pop 42 on the base granary (180, three day-0 stocks since Step070): no
    // farm count reaches the 210-unit target, so the plan reports the largest
    // equilibrium that fits — 119.67 with 23 farms. The next count (24) reaches
    // 184.29: 5 units over the ceiling, and the first tick that rounds up
    // destroys it. That is what the plan's `capacity - 1` ceiling is for; a
    // plan that stops at `capacity` buys a reserve it cannot keep.
    const state = colony(42, 0);
    const plan = planFoodReserve(state);
    expect(plan.capacity).toBe(180);
    expect(plan.capacityShort).toBe(true); // the target itself does not fit
    expect(plan.farms).toBe(23);
    expect(plan.equilibrium).toBeCloseTo(119.67, 1);
    expect(plan.equilibrium).toBeLessThanOrEqual(plan.capacity - 1);
  });

  it("calls the cap short when the target sits exactly on it", () => {
    // pop 36 × the five-tick target = 180 = the whole base granary. The ceiling
    // is `capacity - 1`, so a target of exactly `capacity` cannot be held: the
    // plan must say so instead of promising a stock the clamp eats.
    //
    // This flag is the ONE place mutation F6 (`capacity - 1` -> `capacity`) is
    // visible. The farm choice never discriminates: measured over pop 1..40 ×
    // 0..12 warehouses × yields 2..5, the first equilibrium that reaches the
    // target never lands in the last unit below the cap (0 cases) — the ladder steps by
    // yield / spoilage rate, i.e. 67 units or more, across a one-unit window.
    const state = createInitialState(CONFIG);
    state.population = 36;
    const plan = planFoodReserve(state);
    expect(plan.target).toBe(180);
    expect(plan.capacity).toBe(180);
    expect(plan.capacityShort).toBe(true);
  });

  it("keeps the whole last unit below the cap out of the fallback too", () => {
    // pop 79 on the base granary: the 395-unit target is far above the cap, so
    // the plan reports its largest fitting equilibrium instead. 42 farms reach
    // 115; 43 reach 179.67 — three quarters of a unit UNDER the cap, and the
    // first tick of rounding destroys it. Mutation E2 (`ceiling` -> `capacity`
    // in the candidate scan) only shows here, not in the choice above the
    // target: measured over pop 1..40 × 0..12 warehouses × yields 2..5, the
    // first equilibrium that reaches the target never lands in the last unit below the cap.
    const state = createInitialState(CONFIG);
    state.population = 79;
    const plan = planFoodReserve(state);
    expect(plan.farms).toBe(42);
    expect(plan.equilibrium).toBeCloseTo(115, 0);
    expect(plan.equilibrium).toBeLessThanOrEqual(plan.capacity - 1);
  });

  it("feeds the growth it allows (population, needs and reserve)", () => {
    // Two residences on a fed colony: admission adds colonists, the need rises,
    // and the reserve must still hold — a plan that only fits the current
    // population would starve the next arrival.
    // 5 farms = 16 food: enough for the 12 colonists the housing admits, with
    // a reserve to spare (equilibrium ~117 = 9.8 ticks).
    const state = colony(6, 5, ["cropRotation"]);
    withResidences(state, 12);
    // Step079 fixture fix (assertions unchanged): this colony owned no well and
    // lived on its opening stock, so under the hydric consequences it now spends
    // the run losing colonists to thirst — the food reserve would be measured on
    // a dying colony. Six wells produce the 12 water/tick its full population
    // drinks, which is what the doctrine test always assumed.
    for (let i = 0; i < 6; i++) {
      const spot = freeCell(state);
      const road = adjacentFree(state, spot.x, spot.y);
      mustOk(applyCommand(state, { kind: "placeRoads", cells: [`${road.x},${road.y}`] }));
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 3);
    let minFoodDuringGrowth = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 150; i++) {
      stepTicks(state, 1);
      minFoodDuringGrowth = Math.min(minFoodDuringGrowth, state.resources.food);
    }
    expect(state.population).toBe(12);
    expect(minFoodDuringGrowth).toBeGreaterThan(20);
    const plan = planFoodReserve(state);
    // the reserve is rebuilt at the new population (needs rose by 6)
    expect(state.resources.food).toBeGreaterThan(plan.target);
    expect(plan.production).toBeGreaterThan(state.population);
  });

});
