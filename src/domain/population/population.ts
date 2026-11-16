import type { GameState } from "@/domain/simulation/state.js";
import { isActive } from "@/domain/building/building.js";
import {
  environmentalQuality,
  MIN_QUALITY_FOR_ADMISSION,
} from "@/domain/environment/environment.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";

/** Housing capacity = active operational residences × capacity (1 each). */
export function housingCapacity(state: GameState): number {
  let capacity = 0;
  for (const building of Object.values(state.buildings)) {
    if (!isActive(building)) continue;
    capacity += BUILDING_DEFINITIONS[building.type].housingCapacity;
  }
  return capacity;
}

/** Colonists lost per unfed tick (Step055 option B: gradual, never a wipe). */
export const STARVATION_LOSS_PER_TICK = 1;

/**
 * Population phase: gradual starvation + admission (Step055 option B).
 *
 * An unfed tick removes ONE colonist, never the whole population: the
 * loss stays readable and leaves the player the ticks needed to correct
 * the deficit. Admission is the deterministic growth mechanism: one
 * colonist per tick while housing is vacant and food is available.
 * Water gate (Step077): admission requires the water actually SERVED this
 * tick, not the residual stock. Wells produce before the colonists drink, so
 * an exactly balanced colony ends every tick at 0 water while serving every
 * colonist; testing that stock froze growth for good, silently. The served
 * count is the law the shortage alert already uses — min(stock + production,
 * need). At population 0 it holds trivially (0 >= 0), which subsumes the old
 * bootstrap exemption.
 */
export function updatePopulation(
  state: GameState,
  fedColonists: number,
  servedWater: number,
): void {
  if (fedColonists < state.population) {
    state.population = Math.max(0, state.population - STARVATION_LOSS_PER_TICK);
  }

  if (
    state.population < housingCapacity(state) &&
    state.resources.food > 0 &&
    servedWater >= state.population &&
    // environmental gate (Step014): growth stops in degraded air; the
    // bootstrap exemption mirrors the water rule
    (state.population === 0 || environmentalQuality(state) >= MIN_QUALITY_FOR_ADMISSION)
  ) {
    state.population += 1;
  }
}
