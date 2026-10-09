import type { GameState } from "../simulation/state.js";
import { isAdjacentToRoad } from "../network/network.js";
import { BUILDING_DEFINITIONS } from "../../content/buildings.js";

/** Housing capacity = operational residences × capacity (1 each, documented). */
export function housingCapacity(state: GameState): number {
  let capacity = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.status !== "operational") continue;
    capacity += BUILDING_DEFINITIONS[building.type].housingCapacity;
  }
  return capacity;
}

/** Total staffable jobs among operational, road-adjacent workplaces. */
export function availableJobs(state: GameState): number {
  let jobs = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.status !== "operational") continue;
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
    (state.population === 0 || state.resources.water > 0)
  ) {
    state.population += 1;
  }
}
