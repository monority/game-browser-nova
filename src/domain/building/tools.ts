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
 *
 * The bill is SHIPPED ON, from Age 3 (`WEAR_START_AGE`): the two ages below it
 * cannot carry it, and both walls are measured in the D7 card §7.
 */

export const WEAR_INTERVAL_TICKS = 20;
/**
 * Tools a workshop yields from its wood batch. Measured 2026-11-21: at one per
 * batch the bill (16 tools / 20 ticks in the balanced line) took 80 % of the
 * colony's only workshop and planks fell to +0.4/tick; at four it takes 20 %
 * and planks hold +1.6/tick, with no workplace ever resting. The 2-wood batch is
 * unchanged — only the yield per batch.
 */
export const TOOLS_PER_WORKSHOP_BATCH = 4;
/**
 * The bill starts in Age 3 (measured 2026-11-21, D7 §7). Two walls, both read
 * on the real tick:
 *
 *   - in Age 1 it cannot be paid at all: ten mouths are five farms plus five
 *     wells — ten workers of ten — and the staffing order serves farms and
 *     wells before camps, so no camp takes its worker, no wood is cut, no tool
 *     exists. At 2 per worker and 1 per mouth, food and water saturate the
 *     population exactly at any size, so an extra farm asks for a worker
 *     instead of freeing one;
 *   - in Age 2 it is paid, but it costs the ceiling: the bill is 0.05 tool per
 *     workplace per tick, i.e. 0.1 wood/tick/workplace, so a colony of ~100
 *     workplaces needs one camp per 20 workplaces for maintenance alone on top
 *     of the wood its workshops eat. Measured on the self-play line, the same
 *     reference policy ended with pop 50 instead of 86.
 *
 * Age 3 is where the reference lines carry the surplus that pays it without
 * moving the ceiling: the endgame reference line stays HEALTHY with its tools
 * stocked and no workplace ever resting (planks 944 -> 696 over the worn part).
 */
export const WEAR_START_AGE = 3;

/** The law is on AND the colony is old enough to owe the bill. */
export function wearActive(state: GameState): boolean {
  return state.wearEnabled && state.age >= WEAR_START_AGE;
}

export function wearsTools(building: Building): boolean {
  return BUILDING_DEFINITIONS[building.type].jobCapacity > 0;
}

/**
 * Tools the workshops try to keep in store before making planks: exactly one
 * bill, so the next wear tick can never be paid out of planks. Zero while the
 * law is off — by flag, or before `WEAR_START_AGE`.
 */
export function toolReserveTarget(state: GameState): number {
  if (!wearActive(state)) return 0;
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
  // Ships ON from Age 2 (2026-11-21). Age 1 cannot pay the bill — no wood, no
  // free worker — so charging it there is not a difficulty, it is a death
  // sentence; the measurement is in docs/rebalance/v0.1/decisions/D7-tools-wear.md
  // §7 and `WEAR_START_AGE` above.
  if (!wearActive(state)) return 0;
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
