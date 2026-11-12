import type { GameState } from "@/domain/simulation/state.js";
import { isActive } from "@/domain/building/building.js";
import type { Building } from "@/domain/building/building.js";
import type { BuildingType } from "@/content/buildings.js";
import { regrowAdjacent } from "@/domain/world/deposits.js";

/**
 * Environment system (MVP Phase 7, minimal coherent form):
 * global pollution stock 0–100; active and STAFFED workshops and quarries
 * emit (Step064: an idling workshop produces nothing, so it pollutes
 * nothing); active parks absorb regardless of staffing (they have no job
 * capacity); environmental quality = 100 − pollution.
 * Quality gates *further* admission (bootstrap-exempt like water):
 * existing population is never harmed by pollution in the MVP.
 */

export const POLLUTION_PER_WORKSHOP_PER_TICK = 1;
export const POLLUTION_PER_QUARRY_PER_TICK = 1;
export const ABSORPTION_PER_PARK_PER_TICK = 2;
/** Wood regrown per active park per tick into adjacent deposits (Step018). */
export const WOOD_REGROWTH_PER_PARK_PER_TICK = 1;
const POLLUTION_MIN = 0;
export const POLLUTION_MAX = 100;
/** Below this quality, new colonists are not admitted (pop > 0). */
export const MIN_QUALITY_FOR_ADMISSION = 25;
/**
 * Quality below which the environment becomes worth reporting (the
 * "Environment" alert in application/queries/analysis.ts) — single
 * source for the alert and the pollution overlay tint.
 */
export const ENV_QUALITY_ALERT_THRESHOLD = 50;

export function environmentalQuality(state: GameState): number {
  return POLLUTION_MAX - state.pollution;
}

/**
 * Per-building pollution contribution per tick: positive emits, negative
 * absorbs, 0 for every other type. Single source shared by the tick phase
 * and the inspection panel (Step056), so a building's displayed rate can
 * never drift from the stock it actually moves.
 */
export function pollutionContributionPerTick(type: BuildingType): number {
  switch (type) {
    case "workshop":
      return POLLUTION_PER_WORKSHOP_PER_TICK;
    case "quarry":
      return POLLUTION_PER_QUARRY_PER_TICK;
    case "park":
      return -ABSORPTION_PER_PARK_PER_TICK;
    default:
      return 0;
  }
}

/** Pure per-tick pollution flows (Step053 F1): the single counting used by
 * both the simulation phase and the UI stats — they cannot drift. */
export interface PollutionFlows {
  emissions: number;
  absorption: number;
  net: number;
}

/**
 * Per-building pollution contribution to the STOCK (Step064): the type rate
 * above, gated on being active and, for emitters, staffed. An unstaffed
 * workshop or quarry does no work and therefore emits nothing, while a park
 * (0 job capacity) always absorbs. Single source shared by the tick phase
 * and the inspection line, so the two cannot drift.
 */
export function pollutionContributionForBuilding(building: Building): number {
  if (!isActive(building)) return 0;
  const rate = pollutionContributionPerTick(building.type);
  if (rate > 0 && !building.staffed) return 0;
  return rate;
}

export function pollutionFlows(state: GameState): PollutionFlows {
  let emissions = 0;
  let absorption = 0;
  for (const building of Object.values(state.buildings)) {
    const contribution = pollutionContributionForBuilding(building);
    if (contribution > 0) emissions += contribution;
    else if (contribution < 0) absorption -= contribution;
  }
  return { emissions, absorption, net: emissions - absorption };
}

/**
 * Ticks until the air alone closes the admission gate (quality below
 * MIN_QUALITY_FOR_ADMISSION, i.e. pollution above POLLUTION_MAX minus
 * it): null while the net flow is not positive, 0 when already closed.
 * States-only forecast for the stats panel (Step056 F1): the player sees
 * the deadline instead of discovering the freeze at the housing doorstep.
 */
export function pollutionTicksToAdmissionBlock(state: GameState): number | null {
  const { net } = pollutionFlows(state);
  if (net <= 0) return null;
  // Highest pollution that still admits growth (quality == the threshold).
  const lastCleanPollution = POLLUTION_MAX - MIN_QUALITY_FOR_ADMISSION;
  if (state.pollution > lastCleanPollution) return 0;
  return Math.floor((lastCleanPollution - state.pollution) / net) + 1;
}

/** Tick phase: pollution flows and clamps, then parks regrow adjacent wood. Returns the new pollution level. */
export function updateEnvironment(state: GameState): number {
  const { net } = pollutionFlows(state);
  state.pollution = Math.min(
    POLLUTION_MAX,
    Math.max(POLLUTION_MIN, state.pollution + net),
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
