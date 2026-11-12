import type { GameState } from "@/domain/simulation/state.js";
import { isAdjacentToRoad } from "@/domain/network/network.js";
import { countActiveOfType, isActive } from "@/domain/building/building.js";
import type { BuildingType } from "@/content/buildings.js";
import { addMoney } from "@/domain/resource/resource.js";
import { techLevel } from "@/domain/progression/progression.js";
import { isEventActive } from "@/domain/events/events.js";

/**
 * Step001 money model: revenue = 1 tax/inhabitant + 2 commerce per
 * road-connected operational Workshop; maintenance = 1 per operational
 * building (roads excluded).
 * The treasury is uncapped, clamped >= 0 (accounted, not stored goods).
 * Same-tick revenue lands during the tick, before subsequent commands.
 *
 * Step065 (owner decision): the market — the Age 2 food-for-money trade —
 * is REMOVED. Money now comes from taxes and from the settlement's trade
 * (workshop commerce + the plank throughput bonus), never from selling the
 * granary.
 *
 * Commerce stays staffing-independent on purpose: it is the settlement's
 * trade volume, not a workshop's output (Step001 calibration). Making it
 * require staffing was measured as an alternative (Step065 probe) and
 * rejected: the D2 opening (10 workers / 12 workplaces) would fall to
 * -2/tick and freeze the treasury at t=120 — it needs a D2 re-anchor first.
 */

export const TAX_PER_INHABITANT_PER_TICK = 1;
export const COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK = 2;
/**
 * Throughput bonus (D3/D6 re-anchoring, Step012): +1 per plank actually
 * produced this tick — commerce grows with real transformation work.
 * The 2/tick connection base is unchanged (vacant workshops still earn
 * their calibrated floor).
 */
export const COMMERCE_PER_PLANK_PRODUCED_PER_TICK = 1;
/**
 * Workshop base commerce unlocks at population 8 (Step021 D2 contract):
 * a settlement trades. Below the threshold, connected workshops earn no
 * base floor; the plank throughput bonus stays always-on (production work
 * pays from the first plank, and the camp chain already gates it).
 */
export const MIN_POP_FOR_COMMERCE = 8;

export function commerceUnlocked(state: GameState): boolean {
  return state.population >= MIN_POP_FOR_COMMERCE;
}
export const MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK = 1;

/** Active buildings of one type that have road access. */
function countConnectedOfType(state: GameState, type: BuildingType): number {
  return countActiveOfType(state.buildings, type, (building) =>
    isAdjacentToRoad(state.roads, building.x, building.y),
  );
}

export function connectedWorkshops(state: GameState): number {
  return countConnectedOfType(state, "workshop");
}

/**
 * Pure per-tick money projections — the single source of truth for the
 * money model (Step028): the simulation phases and the derived stats /
 * alerts views compute from these, so UI and simulation cannot drift.
 */

/** Taxes: 1 money per inhabitant per tick. */
export function taxesPerTick(state: GameState): number {
  return state.population * TAX_PER_INHABITANT_PER_TICK;
}

/**
 * Commerce per tick: connection base (population-gated, Step021) plus the
 * tradeRoutes tech bonus, plus the plank throughput bonus (always on).
 * Workshops are EXEMPT from logistics efficiency (Step050 calibration —
 * core-placed; the V2 network storage scope revisits this).
 * `planksProducedThisTick` is the actual transformation output this tick.
 */
export function commercePerTick(state: GameState, planksProducedThisTick = 0): number {
  const perWorkshop =
    COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK + techLevel(state, "workshopCommerce");
  // Closed trade routes (Step047), P2 (Step049): the connection floor runs
  // at HALF (rounded up, so tech keeps its edge) instead of being fully
  // suspended — the aléa slows banking without cutting the only income
  // line. The plank throughput bonus stays always-on: real work still pays.
  const closed = isEventActive(state, "tradeClosure");
  const floorPerWorkshop = closed ? Math.ceil(perWorkshop / 2) : perWorkshop;
  const floor = commerceUnlocked(state)
    ? connectedWorkshops(state) * floorPerWorkshop
    : 0;
  return floor + planksProducedThisTick * COMMERCE_PER_PLANK_PRODUCED_PER_TICK;
}

/** Maintenance owed per tick: non-exempt operational buildings (Step028 shared). */
export function maintenancePerTick(state: GameState): number {
  return operationalBuildingCount(state) * MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK;
}

export function collectRevenue(
  state: GameState,
  planksProducedThisTick = 0,
): { taxes: number; commerce: number } {
  const taxes = taxesPerTick(state);
  const commerce = commercePerTick(state, planksProducedThisTick);
  addMoney(state.resources, taxes + commerce);
  return { taxes, commerce };
}

export function operationalBuildingCount(state: GameState): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    // deactivated (mothballed) buildings pay no maintenance (Step009)
    if (isActive(building) && !isMaintenanceExempt(building)) count += 1;
  }
  return count;
}

/**
 * The Colony Center anchor is operational but does NOT pay uniform
 * maintenance (Step004): billing the recovery capability itself would be
 * an economy-balancing change.
 */
export function isMaintenanceExempt(building: { type: string }): boolean {
  // Housing is infrastructure, not industry (Step021 D2 contract):
  // residences never pay upkeep, mirroring the anchor exemption.
  // Mothballing still removes their housing and jobs as before.
  return building.type === "colonyCenter" || building.type === "residence";
}

export function payMaintenance(state: GameState): number {
  const owed = maintenancePerTick(state);
  addMoney(state.resources, -owed); // clamps at 0: partial payment, never negative
  return owed;
}
