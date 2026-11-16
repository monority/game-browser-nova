import { WATER_PER_SERVED_COLONIST_PER_TICK } from "@/domain/production/production.js";

/**
 * The water law, one home (Step077 §C.1, F12).
 *
 * Wells produce before the colonists drink, so the tick's basis is the stock
 * it has just filled, not the residual left after drinking. An exactly
 * balanced colony ends every tick at 0 water while serving everybody; reading
 * the residual made that state indistinguishable from a shortage and froze
 * growth for good.
 *
 * Both the growth gate and every displayed figure read these two functions —
 * a second expression of either one is how the two views drifted apart.
 */

/** Colonists actually served this tick: min(stock + production, need). */
export function waterServed(
  stock: number,
  productionPerTick: number,
  population: number,
): number {
  const available = stock + productionPerTick;
  return Math.min(
    Math.floor(available / WATER_PER_SERVED_COLONIST_PER_TICK),
    population,
  );
}

/** Presentation balance B = production − need. Ignores the stock by design. */
export function waterBalancePerTick(
  productionPerTick: number,
  population: number,
): number {
  return productionPerTick - population * WATER_PER_SERVED_COLONIST_PER_TICK;
}
