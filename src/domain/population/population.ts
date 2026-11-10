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
 * Water gate: admission requires water headroom, with a bootstrap
 * exemption for the first colonist (population 0) — the documented
 * anti-deadlock rule.
 */
export function updatePopulation(state: GameState, fedColonists: number): void {
  if (fedColonists < state.population) {
    state.population = Math.max(0, state.population - STARVATION_LOSS_PER_TICK);
  }

  if (
    state.population < housingCapacity(state) &&
    state.resources.food > 0 &&
    (state.population === 0 || state.resources.water > 0) &&
    // environmental gate (Step014): growth stops in degraded air; the
    // bootstrap exemption mirrors the water rule
    (state.population === 0 || environmentalQuality(state) >= MIN_QUALITY_FOR_ADMISSION)
  ) {
    state.population += 1;
  }
}
