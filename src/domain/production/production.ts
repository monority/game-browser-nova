import type { GameState } from "@/domain/simulation/state.js";
import { isActive } from "@/domain/building/building.js";
import { techLevel } from "@/domain/progression/progression.js";
import {
  DROUGHT_WATER_REDUCTION_PER_WELL,
  isEventEffectTick,
} from "@/domain/events/events.js";
import { addFood, addWater, deductFood } from "@/domain/resource/resource.js";
import { isLeanSeason } from "@/domain/season/season.js";
import {
  LEAN_SEASON_AFFORDABLE_STOCK_SHARE,
  LEAN_SEASON_IDLE_FARM_SHARE,
} from "@/content/seasons.js";
import { foodCapacity } from "@/domain/storage/storage.js";

export const FOOD_PER_FARM_PER_TICK = 2;
export const WATER_PER_WELL_PER_TICK = 2;
export const FOOD_PER_COLONIST_PER_TICK = 1;
export const WATER_PER_SERVED_COLONIST_PER_TICK = 1;
/**
 * Primitive food trickle of the always-active Colony Center (Step015,
 * audit D4 completion): re-seeds admission after total starvation so the
 * documented terminal state (pop 0 + food 0) becomes recoverable.
 * Deliberately low-rate: a staffed farm (2/tick) always out-produces it,
 * and the trickle alone can never sustain growth (housing + farms are
 * still required).
 */
export const FOOD_PER_COLONY_CENTER_PER_TICK = 1;

/** Staffed active farms + the Colony Center trickle. Farm yield includes
 * technology (cropRotation/irrigation: +1 each, Step016). The harvest is a
 * one-off windfall (P1' Step049) — no event may inflate this rate. */
export function foodPerFarm(state: GameState): number {
  return FOOD_PER_FARM_PER_TICK + techLevel(state, "farmFood");
}

/**
 * Farms that actually work THIS tick (Step070).
 *
 * Out of the lean season every staffed farm works. In the lean season the
 * colony rests up to half of them, scaled by how full the granary is against
 * `LEAN_SEASON_AFFORDABLE_STOCK_SHARE` of its capacity: a full granary parks
 * the full share, a half-empty one parks proportionally less, an empty one
 * parks nothing and the colony eats. That is the whole safety of the season —
 * the harvest can never be cut below what the store can carry, so winter is a
 * dip the player plans for and never a famine they cannot answer.
 *
 * The forecast, the overlay and the tick all read this count, so none of them
 * can promise a harvest the season takes back.
 */
export function workingFarms(state: GameState, tick: number = state.tick): number {
  let farms = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type === "farm" && isActive(building) && building.staffed) farms += 1;
  }
  if (!isLeanSeason(tick) || farms === 0) return farms;
  // What the colony must harvest to eat today: the Center's trickle covers one
  // mouth, every other one costs a farm.
  const needed = Math.max(0, Math.ceil((state.population - FOOD_PER_COLONY_CENTER_PER_TICK) / foodPerFarm(state)));
  const spare = Math.max(0, farms - needed);
  // ...and of the spare farms, only the share the granary can pay for: a full
  // granary parks them, an empty one parks none.
  const affordable = foodCapacity(state) * LEAN_SEASON_AFFORDABLE_STOCK_SHARE;
  const fullness = affordable > 0 ? Math.min(1, Math.max(0, state.resources.food / affordable)) : 0;
  const idle = Math.min(spare, Math.floor(farms * LEAN_SEASON_IDLE_FARM_SHARE * fullness));
  return farms - idle;
}

/** Harvest of the tick numbered `tick` (pure): working farms plus Center
 * trickle. The explicit tick matters at a season boundary — the tick phase
 * increments the clock before it produces, so a forecast of the COMING tick
 * must read the coming tick's season, not the current one (Step070; measured
 * as a one-tick, one-farm disagreement in `cockpit-forecast`).
 * Farms are EXEMPT from logistics efficiency (Step050 calibration: subsistance
 * producers stay full-rate until the V2 network storage lands — measured
 * evidence in the Step050 report). */
export function foodProductionForTick(state: GameState, tick: number): number {
  let produced = workingFarms(state, tick) * foodPerFarm(state);
  // the anchor is always active by contract — no mothball escape hatch
  for (const building of Object.values(state.buildings)) {
    if (building.type === "colonyCenter" && building.status === "operational") {
      produced += FOOD_PER_COLONY_CENTER_PER_TICK;
    }
  }
  return produced;
}

/** Harvest of the tick the state is currently in (the tick phase's own read). */
export function foodProductionPerTick(state: GameState): number {
  return foodProductionForTick(state, state.tick);
}

export function produceFood(state: GameState): void {
  addFood(state.resources, foodProductionPerTick(state));
}

/** Well yield includes the technology lever (+1 per `wellWater` tech) and the
 * drought event reduction (Step047: 2 → 1/tick, taper-aware P1 Step049; the
 * reduction is a flat -1, so a tech well goes 3 → 2 under drought). */
export function waterPerWell(state: GameState): number {
  return (
    WATER_PER_WELL_PER_TICK +
    techLevel(state, "wellWater") -
    (isEventEffectTick(state, "drought") ? DROUGHT_WATER_REDUCTION_PER_WELL : 0)
  );
}

/** Expected water production for the coming tick (pure): staffed wells.
 * Wells are EXEMPT from logistics efficiency (Step050 calibration, see
 * foodProductionPerTick). */
export function waterProductionPerTick(state: GameState): number {
  let produced = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type === "well" && isActive(building) && building.staffed) {
      produced += waterPerWell(state);
    }
  }
  return produced;
}

/** Staffed operational wells produce water (tech-boosted; drought removes 1/well, Step047). */
export function produceWater(state: GameState): void {
  addWater(state.resources, waterProductionPerTick(state));
}

/**
 * Food consumption (Step055 option B): each colonist needs 1/tick and
 * eats in order, so a partial stock feeds part of the colony instead of
 * zeroing the whole population.
 * Returns the number of colonists actually fed this tick.
 */
export function consumeFood(state: GameState): number {
  const requirement = state.population * FOOD_PER_COLONIST_PER_TICK;
  const eaten = Math.min(state.resources.food, requirement);
  deductFood(state.resources, eaten);
  return Math.floor(eaten / FOOD_PER_COLONIST_PER_TICK);
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
