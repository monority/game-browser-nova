import type { GameState } from "../simulation/state.js";
import { isActive } from "../building/building.js";
import { regrowAdjacent } from "../world/deposits.js";

/**
 * Environment system (MVP Phase 7, minimal coherent form):
 * global pollution stock 0–100; active workshops and quarries emit;
 * active parks absorb; environmental quality = 100 − pollution.
 * Quality gates *further* admission (bootstrap-exempt like water):
 * existing population is never harmed by pollution in the MVP.
 */

export const POLLUTION_PER_WORKSHOP_PER_TICK = 1;
export const POLLUTION_PER_QUARRY_PER_TICK = 1;
export const ABSORPTION_PER_PARK_PER_TICK = 2;
/** Wood regrown per active park per tick into adjacent deposits (Step018). */
export const WOOD_REGROWTH_PER_PARK_PER_TICK = 1;
export const POLLUTION_MIN = 0;
export const POLLUTION_MAX = 100;
/** Below this quality, new colonists are not admitted (pop > 0). */
export const MIN_QUALITY_FOR_ADMISSION = 25;

export function environmentalQuality(state: GameState): number {
  return POLLUTION_MAX - state.pollution;
}

/** Tick phase: pollution flows and clamps, then parks regrow adjacent wood. Returns the new pollution level. */
export function updateEnvironment(state: GameState): number {
  let emissions = 0;
  let absorption = 0;
  for (const building of Object.values(state.buildings)) {
    if (!isActive(building)) continue;
    if (building.type === "workshop") emissions += POLLUTION_PER_WORKSHOP_PER_TICK;
    if (building.type === "quarry") emissions += POLLUTION_PER_QUARRY_PER_TICK;
    if (building.type === "park") absorption += ABSORPTION_PER_PARK_PER_TICK;
  }
  state.pollution = Math.min(
    POLLUTION_MAX,
    Math.max(POLLUTION_MIN, state.pollution + emissions - absorption),
  );
  // Forest regrowth (Step018): parks tend adjacent wood deposits back
  // toward capacity. Stone never regrows. Runs after extraction, so regrown
  // wood is collectible next tick.
  for (const building of Object.values(state.buildings)) {
    if (!isActive(building)) continue;
    if (building.type !== "park") continue;
    regrowAdjacent(state.woodDeposits, building.x, building.y, WOOD_REGROWTH_PER_PARK_PER_TICK);
  }
  return state.pollution;
}
