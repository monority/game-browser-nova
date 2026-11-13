import type { GameState } from "@/domain/simulation/state.js";
import { FOOD_SPOILAGE_RATE_PER_TICK } from "@/content/conservation.js";
import {
  FOOD_PER_COLONIST_PER_TICK,
  foodProductionPerTick,
} from "@/domain/production/production.js";
import { foodCapacity } from "@/domain/storage/storage.js";

/**
 * Food conservation (Step067): proportional storage loss, applied every tick
 * to the whole granary (docs/roadmap/Step056-food-preservation-design.md §8).
 * It is NOT an expiry model: no unit is aged, nothing is FIFO — the stock is
 * degraded as an aggregate, the newly harvested food included.
 *
 * The stock is an integer, so the fractional part of a loss cannot be
 * removed. It is carried in `state.foodSpoilCarry` (persisted, save v19) and
 * added to the next tick's loss. Rounding the fraction away instead would
 * create a hidden threshold — at 3% a stock below 34 units would never spoil.
 *
 * Returns whole units only, never more than the stock itself.
 */
export function spoilFood(stock: number, carry: number): { spoiled: number; carry: number } {
  const loss = Math.max(0, stock) * FOOD_SPOILAGE_RATE_PER_TICK + carry;
  const whole = Math.max(0, Math.floor(loss));
  return { spoiled: Math.min(whole, Math.max(0, stock)), carry: loss - whole };
}

/**
 * Stock the colony settles at when it produces `production` for `population`:
 * the fixed point of `S' = (S + P)(1 - r) - C`. A NEGATIVE value is a granary
 * that drains to zero, whatever it currently holds — the emptying test used by
 * `foodTicksRemaining` and the reserve doctrine alike (one law, one home).
 */
export function foodEquilibriumStock(population: number, production: number): number {
  return (
    (production * (1 - FOOD_SPOILAGE_RATE_PER_TICK) -
      population * FOOD_PER_COLONIST_PER_TICK) /
    FOOD_SPOILAGE_RATE_PER_TICK
  );
}

/**
 * Tick phase 5a (Step067): runs AFTER production and BEFORE consumption, so
 * colonists eat what survived conservation instead of what was harvested
 * (same tick ordering as the Step056 recommendation). Returns the units lost.
 */
export function applyFoodSpoilage(state: GameState): number {
  const { spoiled, carry } = spoilFood(state.resources.food, state.foodSpoilCarry);
  state.resources.food = Math.max(0, state.resources.food - spoiled);
  state.foodSpoilCarry = carry;
  return spoiled;
}

/**
 * Ticks until the granary empties under the law the phase actually applies.
 * Spoilage shrinks with the stock, so the linear stock / (-net) division
 * overstates the countdown; this walks the same law forward instead.
 *
 * A positive fixed point is never crossed: the stock moves towards it and
 * stops there, so the answer is null (no countdown) — proven, not guessed.
 * `production >= consumption` is NOT that condition (Step069 measured: pop 19
 * fed by 19/tick settled at −19, i.e. −0.03·S − 0.57 per tick, and emptied in
 * 46 ticks while this function answered null). Flooring the loss only removes
 * less than the law says, so it cannot empty a stock the law keeps alive.
 */
export function foodTicksRemaining(state: GameState): number | null {
  const production = foodProductionPerTick(state);
  if (foodEquilibriumStock(state.population, production) > 0) return null;
  const need = state.population * FOOD_PER_COLONIST_PER_TICK;
  let stock = state.resources.food;
  let carry = state.foodSpoilCarry;
  let ticks = 0;
  while (stock > 0 && ticks < 10000) {
    const afterHarvest = stock + production;
    const loss = spoilFood(afterHarvest, carry);
    carry = loss.carry;
    stock = afterHarvest - loss.spoiled - need;
    ticks += 1;
  }
  return stock > 0 ? null : ticks;
}

/** Exact outcome of the coming tick for food (pure). */
export interface FoodTickProjection {
  /** Harvest of the tick (staffed farms + Center trickle, as the phase reads it). */
  production: number;
  /** Units the colonists will really eat (the need is capped by the stock). */
  eaten: number;
  /** Conservation loss the phase will apply (whole units, carry folded in). */
  spoiled: number;
  /** Surplus destroyed by the storage cap at the end of the tick. */
  wasted: number;
  /** Stock after the tick. */
  stock: number;
  /** stock − current stock: the real per-tick change. */
  net: number;
}

/**
 * Projection of the coming tick, in the pipeline's own order (Step069):
 * production, then conservation, then consumption, then the storage cap.
 * Same primitives as the phases (`foodProductionPerTick`, `spoilFood`,
 * `foodCapacity`), so a projection can never drift from the tick it
 * predicts — `tests/cockpit-forecast.test.ts` pins that equality.
 *
 * Event windfalls (bountiful harvest) resolve at the END of a tick and are
 * not part of the law: a projection states the tick's own arithmetic.
 */
export function projectFoodTick(state: GameState): FoodTickProjection {
  const production = foodProductionPerTick(state);
  const harvest = state.resources.food + production;
  const loss = spoilFood(harvest, state.foodSpoilCarry);
  const afterSpoilage = harvest - loss.spoiled;
  const eaten = Math.min(afterSpoilage, state.population * FOOD_PER_COLONIST_PER_TICK);
  const afterEating = afterSpoilage - eaten;
  const stock = Math.min(afterEating, foodCapacity(state));
  return {
    production,
    eaten,
    spoiled: loss.spoiled,
    wasted: afterEating - stock,
    stock,
    net: stock - state.resources.food,
  };
}
