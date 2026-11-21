import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { isActive } from "@/domain/building/building.js";
import { addPlanks, addTools, deductWood } from "@/domain/resource/resource.js";
import {
  TOOLS_PER_WORKSHOP_BATCH,
  isRestingForTools,
  toolReserveTarget,
} from "@/domain/building/tools.js";
import { compareCellsWithId } from "@/domain/shared/cells.js";

/**
 * First physical transformation (Step006 contract, corrected Step039).
 * Every staffed operational Workshop consumes 2 Wood and produces 2 Planks
 * per tick (ADR atelier, 2026-11-20). The batch is per workshop: a workshop
 * with no full batch
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
/**
 * 2 planks per tick (ADR atelier, 2026-11-20, owner's decision). At 1/tick the
 * colony's survival jobs ate every worker and industry never opened: measured
 * 24-28 inhabitants at the housing cap, 287 ticks with four unstaffed
 * workshops. The wood cost stays 2, so the recipe is 2 Wood → 2 Planks.
 */
export const PLANKS_PER_WORKSHOP_PER_TICK = 2;

/** Staffed operational workshops, canonical order (y, x, id). */
function transformingCandidates(state: GameState): Building[] {
  return Object.values(state.buildings)
    .filter((b) => b.type === "workshop" && isActive(b) && b.staffed && !isRestingForTools(state, b))
    .sort(compareCellsWithId);
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
  // D7 (2026-11-21): the same wood batch cannot feed the houses and the
  // workbenches. The workshops fill the tool reserve first (one bill's worth),
  // then make planks — a stated policy, like the staffing order, rather than a
  // recipe the player would have to flip every twenty ticks.
  const reserved = toolReserveTarget(state);
  const missing = Math.max(0, reserved - state.resources.tools);
  const toolBatches = Math.min(workshops.length, missing);
  if (toolBatches > 0) {
    addTools(state.resources, toolBatches * TOOLS_PER_WORKSHOP_BATCH);
  }
  const plankBatches = workshops.length - toolBatches;
  if (plankBatches > 0) {
    addPlanks(state.resources, plankBatches * PLANKS_PER_WORKSHOP_PER_TICK);
    return plankBatches * PLANKS_PER_WORKSHOP_PER_TICK;
  }
  return 0;
}
