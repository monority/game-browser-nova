import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { foodPerFarm } from "@/domain/production/production.js";
import { planFoodReserve, forecastFoodReserve, FOOD_RESERVE_TICKS } from "@/domain/storage/reserve.js";
import { foodEquilibriumStock } from "@/domain/storage/spoilage.js";
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

function minFood(state: GameState, ticks: number): { min: number; final: number } {
  let min = state.resources.food;
  for (let i = 0; i < ticks; i++) {
    stepTicks(state, 1);
    min = Math.min(min, state.resources.food);
  }
  return { min, final: state.resources.food };
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
    const { min, final } = minFood(state, 600);
    // settles on the predicted equilibrium, never touching zero
    expect(final).toBeGreaterThan(plan.equilibrium - 4);
    expect(final).toBeLessThan(plan.equilibrium + 4);
    expect(min).toBeGreaterThan(20);
  });

  it("asks for storage when the target reserve cannot fit", () => {
    const state = createInitialState(CONFIG);
    state.population = 24;
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

  it("feeds the growth it allows (population, needs and reserve)", () => {
    // Two residences on a fed colony: admission adds colonists, the need rises,
    // and the reserve must still hold — a plan that only fits the current
    // population would starve the next arrival.
    // 5 farms = 16 food: enough for the 12 colonists the housing admits, with
    // a reserve to spare (equilibrium ~117 = 9.8 ticks).
    const state = colony(6, 5, ["cropRotation"]);
    withResidences(state, 12);
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
