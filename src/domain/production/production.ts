import type { GameState } from "../simulation/state.js";
import { addFood, addWater, deductFood } from "../resource/resource.js";

export const FOOD_PER_FARM_PER_TICK = 2;
export const WATER_PER_WELL_PER_TICK = 2;
export const FOOD_PER_COLONIST_PER_TICK = 1;
export const WATER_PER_SERVED_COLONIST_PER_TICK = 1;

/** Staffed operational farms produce +2 food/tick each (next-tick staffing). */
export function produceFood(state: GameState): void {
  let produced = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type === "farm" && building.status === "operational" && building.staffed) {
      produced += FOOD_PER_FARM_PER_TICK;
    }
  }
  addFood(state.resources, produced);
}

/** Staffed operational wells produce +2 water/tick each. */
export function produceWater(state: GameState): void {
  let produced = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type === "well" && building.status === "operational" && building.staffed) {
      produced += WATER_PER_WELL_PER_TICK;
    }
  }
  addWater(state.resources, produced);
}

/**
 * Food consumption is ALL-OR-NOTHING (documented): either the whole
 * population eats (food -= population) or the stock exhausts to 0 and
 * the population phase starves everyone this tick.
 * Returns whether the population was fed.
 */
export function consumeFood(state: GameState): boolean {
  const requirement = state.population * FOOD_PER_COLONIST_PER_TICK;
  if (state.resources.food >= requirement) {
    deductFood(state.resources, requirement);
    return true;
  }
  deductFood(state.resources, state.resources.food);
  return false;
}

/**
 * Water consumption: 1 per served colonist; colonists beyond the stock
 * go unserved this tick (shortage signal, not immediate death).
 */
export function consumeWater(state: GameState): number {
  const served = Math.min(state.resources.water, state.population);
  state.resources.water -= served;
  return served;
}
