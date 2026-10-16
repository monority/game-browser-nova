import type { GameState } from "@/domain/simulation/state.js";
import { isActive } from "@/domain/building/building.js";
import { addPlanks, deductWood } from "@/domain/resource/resource.js";

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
      isActive(building) &&
      building.staffed
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Workshops that will actually transform this tick (staffed AND the full
 * wood batch is available). Pure — no mutation. Used by the economy phase
 * for the throughput-anchored commerce bonus (D3/D6, Step012).
 */
export function plankThroughput(state: GameState): number {
  const workshops = staffedWorkshops(state);
  if (workshops === 0) return 0;
  return state.resources.wood >= workshops * WOOD_PER_PLANK_BATCH ? workshops : 0;
}

/** Tick phase 4: plank transformation. Returns the planks produced. */
export function producePlanks(state: GameState): number {
  const workshops = plankThroughput(state);
  if (workshops === 0) return 0;

  deductWood(state.resources, workshops * WOOD_PER_PLANK_BATCH);
  addPlanks(state.resources, workshops * PLANKS_PER_WORKSHOP_PER_TICK);
  return workshops * PLANKS_PER_WORKSHOP_PER_TICK;
}
