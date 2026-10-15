import type { GameState } from "@/domain/simulation/state.js";
import { isActive } from "@/domain/building/building.js";

/**
 * Storage capacity (Step031): food/water colony stocks are capped by a
 * derived capacity — twice the D2 day-0 stocks as the colony base, plus
 * one day-0 stock per operational warehouse. Derived only, never
 * persisted (same pattern as housingCapacity): no save migration.
 * Money stays an uncapped accounted treasury.
 */

export const BASE_FOOD_CAPACITY = 120;
export const BASE_WATER_CAPACITY = 80;
export const FOOD_PER_WAREHOUSE = 60;
export const WATER_PER_WAREHOUSE = 40;

/** Operational warehouses: active flag + operational status (mothball removes). */
export function operationalWarehouses(state: GameState): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type !== "warehouse") continue;
    if (!isActive(building)) continue;
    count += 1;
  }
  return count;
}

export function foodCapacity(state: GameState): number {
  return BASE_FOOD_CAPACITY + operationalWarehouses(state) * FOOD_PER_WAREHOUSE;
}

export function waterCapacity(state: GameState): number {
  return BASE_WATER_CAPACITY + operationalWarehouses(state) * WATER_PER_WAREHOUSE;
}

/**
 * Tick-phase clamp: runs after consumption, so only the true surplus is
 * lost — the clamp never eats what colonists would have consumed, and
 * market sales (later in the tick) see the capped stock. Famine and
 * sales semantics otherwise unchanged.
 */
export function clampStorage(state: GameState): { foodWasted: number; waterWasted: number } {
  const foodCap = foodCapacity(state);
  const waterCap = waterCapacity(state);
  const foodWasted = Math.max(0, state.resources.food - foodCap);
  const waterWasted = Math.max(0, state.resources.water - waterCap);
  if (foodWasted > 0) state.resources.food = foodCap;
  if (waterWasted > 0) state.resources.water = waterCap;
  return { foodWasted, waterWasted };
}
