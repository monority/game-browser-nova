import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { isAdjacentToRoad } from "@/domain/network/network.js";
import { isActive } from "@/domain/building/building.js";
import { compareCellsWithId } from "@/domain/shared/cells.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";
import { waterPerWell } from "@/domain/production/production.js";
import {
  WATER_PRESSURE_GRAVE_THRESHOLD,
  isSevereShortage,
} from "@/domain/water/water.js";


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

/**
 * Who gets the workers first (Step070). Placement order used to decide it: a
 * colony whose wells and shops happened to sit on lower cells could leave
 * farms idle next door, and since a staffed farm yields exactly one colonist's
 * food, one unstaffed farm means the granary can never fill. The colony eats
 * first, drinks second, and only then works the shops and the wood.
 */
function staffPriority(type: Building["type"]): number {
  if (type === "farm") return 0;
  if (type === "well") return 1;
  return 2;
}

/** Eligible workplaces in staffing order — the ONE home of that order, read by
 *  the assignment and by the ordinary-order probe of the reserve latch. */
function staffingOrder(state: GameState): Building[] {
  return Object.values(state.buildings)
    .filter((b) => isEligibleWorkplace(state, b))
    .sort((a, b) => staffPriority(a.type) - staffPriority(b.type) || compareCellsWithId(a, b));
}

/**
 * Wells the ORDINARY order staffs, without the reserve (Step082a §3.2).
 *
 * This is the counterfactual the latch needs: what the colony would have if
 * Step081's reserve were switched off this tick. Pure — locals only, no
 * `staffed` flag written, same filter and same canonical order as the real
 * assignment — so the answer cannot drift from what the release would produce.
 */
export function ordinaryWellStaffing(state: GameState): number {
  let remaining = state.population;
  let wells = 0;
  for (const workplace of staffingOrder(state)) {
    if (remaining <= 0) break;
    const capacity = BUILDING_DEFINITIONS[workplace.type].jobCapacity;
    remaining -= capacity;
    if (workplace.type === "well") wells += capacity;
  }
  return wells;
}

/**
 * Water the ordinary order alone can PRODUCE, capped by the population — the
 * standing counterfactual the latch needs.
 *
 * Deliberately capacity, not stock: measuring the stock let a full cistern
 * release the reserve, which then drained, turned the shortage severe again and
 * re-armed — 67 assignments in 200 ticks at population 3 (measured, Step082b).
 * The cistern is a buffer, not a capability: a colony that cannot serve itself
 * from its wells is not ready to give the wells back.
 */
export function ordinaryWaterCapacity(state: GameState): number {
  return Math.min(ordinaryWellStaffing(state) * waterPerWell(state), state.population);
}

/**
 * The reserve latch (Step082a §3.3, model B1).
 *
 * Step079/081 measured the trap the reserve removes, and Step082a measured what
 * it introduced: at exact well capacity (pop 10, five wells) the reserve
 * restored coverage to 100 %, the gauge fell below 75, the reserve dropped, the
 * shortage turned severe again and the gauge climbed back — 126 assignments in
 * 200 ticks.
 *
 * The cure is not to tune the threshold but to make the exit monotone: the
 * reserve lets go ONLY when the ordinary order already serves at least 75 % of
 * the colony, i.e. in the band where the gauge HOLDS. From there it can fall
 * (full coverage) but never rise back to 75, so a release cannot be followed by
 * a re-arm: the cycle has no second leg.
 *
 * Arming stays where Step081 put it (the grave band, 75) and the reserve size,
 * its bounds and the farm-first order are untouched. One boolean, one exit
 * rule, no new resource.
 */
export function updateWaterReserveLatch(state: GameState): void {
  if (state.waterPressure >= WATER_PRESSURE_GRAVE_THRESHOLD) {
    state.waterReserveLatched = true;
    return;
  }
  if (!state.waterReserveLatched) return;
  // Held while the ordinary order is still severe; released into the light band
  // (or a balanced colony), where the gauge holds or falls.
  if (!isSevereShortage(ordinaryWaterCapacity(state), state.population)) {
    state.waterReserveLatched = false;
  }
}

/**
 * Workers the wells may claim first (Step081, Step080 §3.3), while the latch
 * holds.
 *
 * Step079 measured the trap this removes: at pop 8 with 7 farms and 3 wells the
 * farms took the workers one by one as the colony shrank, water produced fell to
 * 2 then 0, and the population drained to the floor without ever recovering.
 *
 * The reserve is BOUNDED BY THE NEED, not by the number of wells: two water per
 * well serve two colonists, so `ceil(population / 2)` wells cover everybody.
 * Armed only by the grave band or by a latch that has not been released yet
 * (Step082b) — below it, the colony keeps its Step070 farm-first order.
 *
 * It is a staffing priority, never a fictional allocation: the reserved workers
 * are removed from the pool before the usual order runs, so no worker is
 * counted twice.
 */
export function waterWorkerReserve(state: GameState): number {
  if (!state.waterReserveLatched) return 0;
  return Math.ceil(state.population / 2);
}

export function assignJobs(state: GameState): void {
  for (const building of Object.values(state.buildings)) {
    building.staffed = false;
  }

  const ordered = staffingOrder(state);

  let remaining = state.population;

  // First pass (Step081): the hydric reserve, bounded by the need, the workers
  // available and the well posts that actually exist. Iterating `ordered` keeps
  // the canonical well order of the second pass.
  const wellPosts = ordered.reduce(
    (sum, b) => (b.type === "well" ? sum + BUILDING_DEFINITIONS[b.type].jobCapacity : sum),
    0,
  );
  const reserve = Math.min(waterWorkerReserve(state), remaining, wellPosts);
  let reserved = 0;
  if (reserve > 0) {
    for (const well of ordered) {
      if (well.type !== "well") continue;
      const capacity = BUILDING_DEFINITIONS[well.type].jobCapacity;
      if (reserved + capacity > reserve) break;
      well.staffed = true;
      reserved += capacity;
      remaining -= capacity;
    }
  }

  // Second pass: the usual order (farms, then the wells the reserve did not
  // cover, then everything else), skipping what the first pass already staffed.
  for (const workplace of ordered) {
    if (workplace.staffed) continue;
    if (remaining <= 0) break;
    workplace.staffed = true;
    remaining -= BUILDING_DEFINITIONS[workplace.type].jobCapacity;
  }
}
