import type { GameState } from "../simulation/state.js";
import { isAdjacentToRoad } from "../network/network.js";
import { isActive } from "../building/building.js";
import { BUILDING_DEFINITIONS } from "../../content/buildings.js";


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
export function assignJobs(state: GameState): void {
  for (const building of Object.values(state.buildings)) {
    building.staffed = false;
  }

  const eligible = Object.values(state.buildings)
    .filter(
      (b) =>
        isActive(b) &&
        BUILDING_DEFINITIONS[b.type].jobCapacity > 0 &&
        isAdjacentToRoad(state.roads, b.x, b.y),
    )
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));

  let remaining = state.population;
  for (const workplace of eligible) {
    if (remaining <= 0) break;
    workplace.staffed = true;
    remaining -= BUILDING_DEFINITIONS[workplace.type].jobCapacity;
  }
}
