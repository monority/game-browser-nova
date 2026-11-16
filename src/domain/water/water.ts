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
 * Both the growth gate and every displayed figure read these functions — a
 * second expression of either one is how the two views drifted apart.
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

/** Coverage 0–1. No need means nothing is missing. */
export function waterCoverage(served: number, need: number): number {
  return need === 0 ? 1 : served / need;
}

/** A shortage is severe below 75 % — integer test, so 75 % exactly is `light`. */
export function isSevereShortage(served: number, need: number): boolean {
  return need > 0 && 4 * served < 3 * need;
}

export type WaterState = "balanced" | "light" | "severe";

/** §3.1: an empty stock with full service is `balanced`, not a shortage. */
export function waterState(served: number, need: number): WaterState {
  if (need === 0 || served >= need) return "balanced";
  return isSevereShortage(served, need) ? "severe" : "light";
}

export const WATER_PRESSURE_MAX = 100;
/**
 * Pressure points added per tick at a total blackout (coverage 0). Calibrated
 * against the tick's own integers: the §D2 proportional law has no usable
 * resolution near the boundary (k = 2 gives 0.0155 point/tick at 64/86, i.e.
 * 6 451 ticks to saturation — 54 minutes at 1×), so the gauge adds whole
 * points and never less than one while the shortage is severe.
 */
export const WATER_PRESSURE_GAIN_AT_BLACKOUT = 4;
/** Recovery: 1 point/tick once coverage is back to 100 % (§5, q = 1). */
export const WATER_PRESSURE_RECOVERY_PER_TICK = 1;

/** Points this tick, when the shortage is severe: proportional, floor of 1. */
export function waterPressureGain(served: number, need: number): number {
  if (!isSevereShortage(served, need)) return 0;
  const severity = (3 * need - 4 * served) / (3 * need); // (0, 1]
  return Math.max(1, Math.round(WATER_PRESSURE_GAIN_AT_BLACKOUT * severity));
}

/**
 * §4–§5: rises while severe, holds during a light deficit, falls only when
 * coverage is fully restored. Bounded to [0, 100], integer.
 */
export function updateWaterPressure(
  current: number,
  served: number,
  need: number,
): number {
  const held = Math.min(WATER_PRESSURE_MAX, Math.max(0, Math.round(current)));
  const state = waterState(served, need);
  if (state === "balanced") {
    return Math.max(0, held - WATER_PRESSURE_RECOVERY_PER_TICK);
  }
  if (state === "light") return held;
  return Math.min(
    WATER_PRESSURE_MAX,
    held + waterPressureGain(served, need),
  );
}

export type WaterPressureLevel =
  | "normal"
  | "tension"
  | "crisis"
  | "grave"
  | "critical";

/** §6: gauge bands, deliberately not the coverage bands. */
export function waterPressureLevel(pressure: number): WaterPressureLevel {
  if (pressure >= WATER_PRESSURE_MAX) return "critical";
  if (pressure >= 75) return "grave";
  if (pressure >= 50) return "crisis";
  if (pressure >= 25) return "tension";
  return "normal";
}
