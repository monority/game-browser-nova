import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { isAdjacentToRoad } from "@/domain/network/network.js";
import { isActive } from "@/domain/building/building.js";
import { compareCellsWithId } from "@/domain/shared/cells.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";


/**
 * Aggregate workforce assignment (ADR-004).
 * Eligible workplace = active (operational, not mothballed), job capacity > 0,
 * road-adjacent (staffing requires road access). Colonists fill workplaces
 * greedily in canonical order (y asc, x asc, id); capacity 1 per documented
 * contract.
 *
 * Timing contract: assignJobs runs as the LAST phase of a tick, so a
 * newly operational workplace is staffed next tick — production phases
 * read the previous assignment.
 */
export function isEligibleWorkplace(state: GameState, building: Building): boolean {
  return (
    isActive(building) &&
    BUILDING_DEFINITIONS[building.type].jobCapacity > 0 &&
    isAdjacentToRoad(state.roads, building.x, building.y)
  );
}

export function assignJobs(state: GameState): void {
  for (const building of Object.values(state.buildings)) {
    building.staffed = false;
  }

  const eligible = Object.values(state.buildings)
    .filter((b) => isEligibleWorkplace(state, b))
    .sort(compareCellsWithId);

  let remaining = state.population;
  for (const workplace of eligible) {
    if (remaining <= 0) break;
    workplace.staffed = true;
    remaining -= BUILDING_DEFINITIONS[workplace.type].jobCapacity;
  }
}
