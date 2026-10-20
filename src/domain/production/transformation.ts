import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { isActive } from "@/domain/building/building.js";
import { addPlanks, deductWood } from "@/domain/resource/resource.js";

/**
 * First physical transformation (Step006 contract, corrected Step039).
 * Every staffed operational Workshop consumes 2 Wood and produces 1 Plank
 * per tick. The batch is per workshop: a workshop with no full batch
 * produces nothing (no partial plank), but a wood shortfall stops only the
 * workshops it cannot feed — it never zeroes the whole chain.
 *
 * Wood is allocated in canonical order (y, x, id), the same order that
 * assignJobs uses: the earliest workshops are served first, late-built
 * ones starve first (Step021/Step022 triage doctrine).
 *
 * Commerce is UNCHANGED and separate: the connection-based commerce
 * contract (2/tick, staffing-independent) still applies to every
 * operational connected Workshop, plus the throughput bonus for planks
 * actually produced (D3/D6, Step012).
 */

export const WOOD_PER_PLANK_BATCH = 2;
export const PLANKS_PER_WORKSHOP_PER_TICK = 1;

export function staffedWorkshops(state: GameState): number {
  return transformingCandidates(state).length;
}

/** Staffed operational workshops, canonical order (y, x, id). */
function transformingCandidates(state: GameState): Building[] {
  return Object.values(state.buildings)
    .filter((b) => b.type === "workshop" && isActive(b) && b.staffed)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/**
 * Workshops that transform this tick: each needs its own 2-wood batch, so
 * a colony with W wood feeds floor(W / 2) workshops. Pure — no mutation.
 * Used by the economy phase for the throughput-anchored commerce bonus.
 */
export function transformingWorkshops(state: GameState): Building[] {
  const batches = Math.floor(state.resources.wood / WOOD_PER_PLANK_BATCH);
  if (batches <= 0) return [];
  return transformingCandidates(state).slice(0, batches);
}

/** Number of workshops that will actually transform this tick. */
export function plankThroughput(state: GameState): number {
  return transformingWorkshops(state).length;
}

/** Tick phase 4: plank transformation. Returns the planks produced. */
export function producePlanks(state: GameState): number {
  const workshops = transformingWorkshops(state);
  if (workshops.length === 0) return 0;

  deductWood(state.resources, workshops.length * WOOD_PER_PLANK_BATCH);
  addPlanks(state.resources, workshops.length * PLANKS_PER_WORKSHOP_PER_TICK);
  return workshops.length * PLANKS_PER_WORKSHOP_PER_TICK;
}
