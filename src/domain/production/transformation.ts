import type { GameState } from "../simulation/state.js";
import { addPlanks, deductWood } from "../resource/resource.js";

/**
 * First physical transformation (Step006 contract).
 * Every staffed operational Workshop consumes 2 Wood and produces 1 Plank
 * per tick, all-or-nothing: the full wood batch is required, deduction is
 * atomic, and a shortfall produces nothing.
 *
 * Commerce is UNCHANGED and separate: the connection-based commerce
 * contract (2/tick, staffing-independent) still applies to every
 * operational connected Workshop. This physical/commerce separation is
 * documented and temporary (re-anchoring deferred, audit D3/D6).
 */

export const WOOD_PER_PLANK_BATCH = 2;
export const PLANKS_PER_WORKSHOP_PER_TICK = 1;

export function staffedWorkshops(state: GameState): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (
      building.type === "workshop" &&
      building.status === "operational" &&
      building.staffed
    ) {
      count += 1;
    }
  }
  return count;
}

/** Tick phase 4e: plank transformation. */
export function producePlanks(state: GameState): void {
  const workshops = staffedWorkshops(state);
  if (workshops === 0) return;

  const batch = workshops * WOOD_PER_PLANK_BATCH;
  if (state.resources.wood < batch) return; // all-or-nothing

  deductWood(state.resources, batch);
  addPlanks(state.resources, workshops * PLANKS_PER_WORKSHOP_PER_TICK);
}
