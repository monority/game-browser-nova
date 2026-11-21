import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { isActive } from "@/domain/building/building.js";
import { compareCellsWithId } from "@/domain/shared/cells.js";
import { deductTools } from "@/domain/resource/resource.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";

/**
 * Wear (D7, 2026-11-21).
 *
 * A workplace spends a tool. The bill is not charged on a per-building clock:
 * every `WEAR_INTERVAL_TICKS` ticks the colony owes one tool per staffed
 * workplace, and the ones it cannot pay for rest that tick. Three consequences,
 * all deliberate:
 *
 *   - the wear state is ZERO new state: the clock is the tick number, so a save
 *     needs nothing but the tool stock (no counter per building to migrate);
 *   - the bill is exact with integer production — a workplace loses a tick, it
 *     never loses "60 %" of a 2-unit yield (measured: 2 → 1 is a 50 % cut);
 *   - service order is canonical (y, x, id), the same order the workforce and
 *     the wood allocation use: the earliest workplaces are served, the latest
 *     built rest first.
 *
 * The rest is recomputed every tick, so it is transient: `restingWorkplaces` is
 * derived state, never saved. A workplace that was NOT staffed last tick owes
 * nothing — a rest post does not wear tools it did not use.
 */

export const WEAR_INTERVAL_TICKS = 20;
/** Tools a workshop yields from its wood batch when it is set to make them. */
export const TOOLS_PER_WORKSHOP_BATCH = 1;

export function wearsTools(building: Building): boolean {
  return BUILDING_DEFINITIONS[building.type].jobCapacity > 0;
}

/**
 * Tools the workshops try to keep in store before making planks: exactly one
 * bill, so the next wear tick can never be paid out of planks. Zero while the
 * wear law is off, which is the shipped default.
 */
export function toolReserveTarget(state: GameState): number {
  if (!state.wearEnabled) return 0;
  let workplaces = 0;
  for (const building of Object.values(state.buildings)) {
    if (isActive(building) && building.staffed && wearsTools(building)) workplaces += 1;
  }
  return workplaces;
}

/** True while this workplace is resting for want of a tool this tick. */
export function isRestingForTools(state: GameState, building: Building): boolean {
  return state.restingWorkplaces[building.id] === true;
}

/**
 * Tick phase, before any production: settle the tool bill and publish who
 * rests. Returns how many workplaces could not be paid for.
 */
export function maintainWorkplaces(state: GameState): number {
  state.restingWorkplaces = {};
  // Not shipped (2026-11-21). The bill is implemented and measured, but every
  // reference line turns CRITICAL under it — the shipped opening runs at an
  // exact food/water equilibrium, so even a lost tick starves it. Enabling it
  // is a balance decision (docs/rebalance/v0.1/decisions/D7-tools-wear.md §8),
  // not a code default.
  if (!state.wearEnabled) return 0;
  if (state.tick % WEAR_INTERVAL_TICKS !== 0) return 0;

  const workplaces = Object.values(state.buildings)
    .filter((b) => isActive(b) && b.staffed && wearsTools(b))
    .sort(compareCellsWithId);

  let unpaid = 0;
  for (const workplace of workplaces) {
    if (deductTools(state.resources, 1) === 0) {
      state.restingWorkplaces[workplace.id] = true;
      unpaid += 1;
    }
  }
  return unpaid;
}
