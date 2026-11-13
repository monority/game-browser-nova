import type { GameState } from "@/domain/simulation/state.js";
import { FOOD_SPOILAGE_RATE_PER_TICK } from "@/content/conservation.js";
import {
  FOOD_PER_COLONIST_PER_TICK,
  FOOD_PER_COLONY_CENTER_PER_TICK,
  foodPerFarm,
} from "@/domain/production/production.js";
import { foodCapacity } from "@/domain/storage/storage.js";
import {
  foodEquilibriumStock,
  foodTicksRemaining,
  projectFoodTick,
} from "@/domain/storage/spoilage.js";

// The fixed point of the conservation law lives in spoilage.ts (one formula,
// one home); re-exported here because the doctrine is what reads it most.
export { foodEquilibriumStock };

/**
 * Food reserve doctrine (Step068).
 *
 * Step056 sized farms to the exact balance `farms = ceil(pop / yield)`. That
 * law has no margin: the moment the granary loses 3%/tick (Step067) its fixed
 * point is `S* = (P - C) / r` with `P = C`, i.e. zero, and the colony lives on
 * the starvation boundary — one death and one admission per tick, forums
 * permanently unfed (measured on the three shipped journeys and on the
 * self-play governor, 2026-11-13).
 *
 * The replacement is one law, shared by the governor and its tests:
 *
 *   S_next = (S + P)(1 - r) - C        (production, then conservation, then eating)
 *   S*     = (P(1 - r) - C) / r
 *   P(R)   = (C + r·R) / (1 - r)       production needed to hold reserve R
 *   R      = C · T                     T ticks of autonomy
 *
 * `planFoodReserve` turns that into an integer farm count: the achievable
 * equilibrium `S*(k)` is computed for every farm count and the closest one to
 * the target is chosen, NEVER one that overflows the granary. Granularity is
 * real (one farm is 2-4 food/tick, which moves the equilibrium by 32-65 units
 * at 3%) and is reported, not hidden: `autonomy` is the reserve the chosen
 * count actually reaches.
 *
 * Nothing here re-implements conservation: the rate is the content constant
 * the tick phase uses, the yields are the production module's own functions,
 * and the storage cap is the storage module's. This module only answers
 * "how many farms", so the tick stays the single source of truth.
 */

/**
 * Target autonomy in ticks of consumption. Measured, not assumed
 * (docs/roadmap/Step068-food-reserve.md §3): 5 ticks is the smallest target
 * that (a) never leaves the shipped journeys in the starvation band, (b) is
 * reachable inside the age-1 grantary without a warehouse at pop 16, and
 * (c) does not pin the granary at low populations. 10 ticks is unreachable
 * before warehouses at every population; 2 ticks still flickers.
 */
export const FOOD_RESERVE_TICKS = 5;

/**
 * Food triage floor, in ticks of consumption: below it the governor rests
 * water/wood/stone getters so workers flow to the farms (Step022 doctrine).
 * Expressed in ticks rather than the old `pop + 4` offset, which meant a
 * different autonomy at every population (2.3 ticks at pop 3, 1.5 at pop 24).
 */
export const FOOD_TRIAGE_TICKS = 2;

/** Production needed to hold `target` in stock at equilibrium (float). */
export function foodProductionForReserve(population: number, target: number): number {
  if (population <= 0) return 0;
  return (population + FOOD_SPOILAGE_RATE_PER_TICK * target) / (1 - FOOD_SPOILAGE_RATE_PER_TICK);
}

export interface FoodReservePlan {
  /** Ticks of consumption the doctrine aims for. */
  targetTicks: number;
  /** Stock that target corresponds to (`population × targetTicks`). */
  target: number;
  /** Granary size available to hold it. */
  capacity: number;
  /** True when the target itself does not fit: the governor must build storage. */
  capacityShort: boolean;
  /** Farms that reach the closest equilibrium to the target. */
  farms: number;
  /** Production those farms yield, Colony Center trickle included. */
  production: number;
  /** Stock the colony settles at with that production (clamped at 0). */
  equilibrium: number;
  /** Autonomy the plan actually reaches, in ticks of consumption. */
  autonomy: number;
  /** Triage floor in units (`population × FOOD_TRIAGE_TICKS`). */
  triageFloor: number;
}

/**
 * Farm count for the reserve doctrine. Picks the achievable equilibrium
 * closest to `population × ticks`; ties go to the larger reserve (more
 * headroom for events), and a plan whose equilibrium would overflow the
 * granary is never chosen — that surplus would be destroyed at the cap.
 */
export function planFoodReserve(
  state: GameState,
  ticks: number = FOOD_RESERVE_TICKS,
): FoodReservePlan {
  const population = state.population;
  const capacity = foodCapacity(state);
  const target = population * ticks;
  const triageFloor = population * FOOD_TRIAGE_TICKS;
  const yieldPerFarm = foodPerFarm(state);
  const center = FOOD_PER_COLONY_CENTER_PER_TICK;
  // One unit of headroom: an equilibrium sitting exactly on the cap destroys
  // the first tick that rounds up.
  const ceiling = capacity - 1;

  if (population <= 0 || yieldPerFarm <= 0) {
    return {
      targetTicks: ticks,
      target,
      capacity,
      capacityShort: target > ceiling,
      farms: 0,
      production: 0,
      equilibrium: 0,
      autonomy: 0,
      triageFloor,
    };
  }

  const required = foodProductionForReserve(population, target);
  // Search far enough to see the branch above the target (the nearest
  // achievable equilibrium may sit on either side of it).
  const maxFarms = Math.max(1, Math.ceil((required * 2 + center) / yieldPerFarm) + 2);

  let atOrAbove: { farms: number; production: number; equilibrium: number } | null = null;
  let largestBelow: { farms: number; production: number; equilibrium: number } | null = null;
  let famineFloor: { farms: number; production: number; equilibrium: number } | null = null;

  for (let farms = 0; farms <= maxFarms; farms++) {
    const production = center + farms * yieldPerFarm;
    const equilibrium = foodEquilibriumStock(population, production);
    const candidate = { farms, production, equilibrium };
    // The colony must at least feed itself at equilibrium, otherwise the plan
    // simply starves (kept only as the last-resort fallback below).
    if (equilibrium <= 0) {
      if (!famineFloor && production >= population) famineFloor = candidate;
      continue;
    }
    if (equilibrium > ceiling) continue;
    if (equilibrium >= target) {
      // Over-reserve is the safe side: the first count that reaches the target
      // wins, never a nearer-but-under-target one. Under-target is the
      // starvation band the doctrine exists to remove.
      if (!atOrAbove || equilibrium < atOrAbove.equilibrium) atOrAbove = candidate;
    } else if (!largestBelow || equilibrium > largestBelow.equilibrium) {
      largestBelow = candidate;
    }
  }

  const chosen = atOrAbove ?? largestBelow ?? famineFloor ?? { farms: 0, production: center, equilibrium: 0 };
  return {
    targetTicks: ticks,
    target,
    capacity,
    capacityShort: target > ceiling,
    farms: chosen.farms,
    production: chosen.production,
    equilibrium: Math.max(0, chosen.equilibrium),
    autonomy: population > 0 ? Math.max(0, chosen.equilibrium) / (population * FOOD_PER_COLONIST_PER_TICK) : 0,
    triageFloor,
  };
}

/** What the colony's food economy is doing, in the doctrine's own terms. */
export type FoodReserveStatus =
  | "deficit"
  | "storage-limited"
  | "thin"
  | "building"
  | "funded";

export interface FoodReserveIsolation {
  stock: number;
  /** Steady stock the current production reaches, capped by the granary. */
  equilibrium: number;
  target: number;
  /** The target itself does not fit the granary. */
  capacityShort: boolean;
}

/**
 * Classifies the food situation (Step069, the cockpit's verdict):
 *  - `deficit`: production cannot hold ANY stock (the granary drains to 0);
 *  - `storage-limited`: the granary cannot hold the 5-tick target;
 *  - `thin`: production holds food, but settles under the target;
 *  - `building`: production funds the target, the stock is on its way;
 *  - `funded`: production and stock both meet the target.
 * A deficit outranks a storage limit: a full granary that drains is not a
 * capacity problem.
 */
export function foodReserveStatus(input: FoodReserveIsolation): FoodReserveStatus {
  if (input.equilibrium <= 0) return "deficit";
  if (input.target <= 0) return "thin";
  if (input.capacityShort) return "storage-limited";
  if (input.stock >= input.target && input.equilibrium >= input.target) return "funded";
  if (input.equilibrium >= input.target) return "building";
  return "thin";
}

/**
 * Reserve view of the colony as it stands (Step069): the same law as
 * `planFoodReserve`, applied to the production the colony already runs, so the
 * cockpit reports the simulation instead of a second doctrine. Every quantity
 * comes from the tick's own primitives — the projection applies production,
 * conservation, consumption and the storage cap in that order, `autonomyTicks`
 * walks the same law, and the target is `FOOD_RESERVE_TICKS` of consumption.
 */
export interface FoodReserveForecast {
  /** Harvest of the coming tick (staffed farms + Center trickle). */
  productionPerTick: number;
  /** Need of the coming tick (`population × FOOD_PER_COLONIST_PER_TICK`). */
  consumptionPerTick: number;
  /** Conservation loss the coming tick will really apply. */
  spoilagePerTick: number;
  /** Exact stock change of the coming tick (carry and storage cap included). */
  netPerTick: number;
  stock: number;
  /** Stock after the coming tick, in the pipeline's order. */
  projectedStock: number;
  targetTicks: number;
  target: number;
  capacity: number;
  capacityShort: boolean;
  /** Where the granary settles with this production (0 when it drains). */
  equilibrium: number;
  /** Production that would hold the target (`P(R)`, float). */
  productionForTarget: number;
  /** Ticks of consumption the stock covers; null when it never empties. */
  autonomyTicks: number | null;
  status: FoodReserveStatus;
}

export function forecastFoodReserve(
  state: GameState,
  ticks: number = FOOD_RESERVE_TICKS,
): FoodReserveForecast {
  const population = state.population;
  const capacity = foodCapacity(state);
  const target = population * ticks;
  const projection = projectFoodTick(state);
  const steady = foodEquilibriumStock(population, projection.production);
  // Past the cap the granary holds at most `capacity`, whatever the law says.
  const equilibrium = Math.max(0, Math.min(steady, capacity));
  const capacityShort = target > capacity - 1;
  return {
    productionPerTick: projection.production,
    consumptionPerTick: population * FOOD_PER_COLONIST_PER_TICK,
    spoilagePerTick: projection.spoiled,
    netPerTick: projection.net,
    stock: state.resources.food,
    projectedStock: projection.stock,
    targetTicks: ticks,
    target,
    capacity,
    capacityShort,
    equilibrium,
    productionForTarget: foodProductionForReserve(population, target),
    autonomyTicks: foodTicksRemaining(state),
    status: foodReserveStatus({
      stock: state.resources.food,
      equilibrium,
      target,
      capacityShort,
    }),
  };
}

/**
 * Largest population the food economy funds at the reserve target: the
 * ceiling where `min(steady stock, granary) ≥ population × ticks`. Monotone in
 * population (the steady stock falls as eaters are added), so the scan below
 * stops at the first failure. This is the number the cockpit must report as
 * "capacity": `floor(production)` credits a resident the 3% loss will kill
 * (measured Step069: 19 residents claimed, 16 funded).
 */
export function foodSustainablePopulation(
  production: number,
  capacity: number,
  ticks: number = FOOD_RESERVE_TICKS,
): number {
  let population = 0;
  // Safety bound: a colony of 1000 is far past any shipped world, and the
  // loop stops at the first infeasible count anyway.
  while (population < 1000) {
    const next = population + 1;
    const steady = foodEquilibriumStock(next, production);
    if (Math.min(steady, capacity) < next * ticks) break;
    population = next;
  }
  return population;
}
