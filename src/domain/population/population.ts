import type { GameState } from "@/domain/simulation/state.js";
import { isAdjacentToRoad } from "@/domain/network/network.js";
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

/** Total staffable jobs among operational, road-adjacent workplaces. */
export function availableJobs(state: GameState): number {
  let jobs = 0;
  for (const building of Object.values(state.buildings)) {
    if (!isActive(building)) continue;
    if (BUILDING_DEFINITIONS[building.type].jobCapacity === 0) continue;
    if (!isAdjacentToRoad(state.roads, building.x, building.y)) continue;
    jobs += BUILDING_DEFINITIONS[building.type].jobCapacity;
  }
  return jobs;
}

/**
 * Population phase: starvation + admission (documented contract).
 *
 * Starvation is all-or-nothing: an unfed tick removes the ENTIRE
 * population. Admission is the deterministic growth mechanism: one
 * colonist per tick while housing is vacant and food is available.
 * Water gate: admission requires water headroom, with a bootstrap
 * exemption for the first colonist (population 0) — the documented
 * anti-deadlock rule.
 */
export function updatePopulation(state: GameState, fedThisTick: boolean): void {
  if (!fedThisTick) {
    state.population = 0;
    return;
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
