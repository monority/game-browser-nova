import type { GameState } from "@/domain/simulation/state.js";
import { isAdjacentToRoad } from "@/domain/network/network.js";
import { countActiveOfType, isActive } from "@/domain/building/building.js";
import type { BuildingType } from "@/content/buildings.js";
import { addMoney } from "@/domain/resource/resource.js";
import { techLevel } from "@/domain/progression/progression.js";
import { isEventActive } from "@/domain/events/events.js";
import { waterEmergencyCost, waterServed } from "@/domain/water/water.js";
import { waterProductionPerTick } from "@/domain/production/production.js";

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

/**
 * Crowding (Step072): what a settlement costs its people, beyond the buildings.
 *
 * Measured on the self-play line at pop 24 with 54 buildings: taxes 24 +
 * commerce 12 − maintenance 29 = **+7 money per tick with nothing left to
 * buy**, so the treasury rose for ever (5 561 at tick 1500 and climbing). Money
 * is a currency only while it is scarce, and a fixed upkeep against a growing
 * town cannot keep it scarce.
 *
 * The charge starts ABOVE THE FOUNDING STOCK (D2 ships 10 colonists) and costs
 * one money per FIVE of them: nothing at pop 10 — the opening keeps the surplus
 * it needs to build with, measured as +3/tick — 2 at pop 24, 7 at pop 45, 15 at
 * pop 86.
 *
 * The divisor is set by GROWTH, not by the pile, and that is a trade-off worth
 * recording. Swept on the same self-play run (capacity 240 / capacity 24, money
 * at tick 1500):
 *   /3 → pop 30, treasury 0 — the charge ate the surplus that digs wells, and
 *        the settlement froze three colonists short of its housing;
 *   /4 → pop 47, treasury 0, water 0 — same wall, a little later;
 *   /5 → pop 86 (the harness ceiling), 4 870 — growth intact, the pile cut
 *        from 5 561 to 3 685 at the capped colony;
 *   none → pop 86, 21 846 and rising, i.e. the runaway this charge exists for.
 * So the charge cannot both flatten a capped colony and leave a thin one able
 * to grow: any figure near the endgame surplus (+7/tick) also cancels the
 * margin a mid-size settlement lives on.
 * Paid with the maintenance, in the same phase.
 *
 * Re-measured 2026-11-17 on the same governor, because the water line landed
 * in between and invalidated the "capital question" this comment used to end
 * on. At the harness's own pop-24 cap the colony holds 1750 money and 226
 * planks and earns +3/tick (taxes 24 + commerce 12 − upkeep 31 − people 2),
 * with plank production at 0 (wood 1) — so the planks are stranded, not
 * throughput, and a pile here means the colony has stopped building. Let it
 * grow to its ceiling (housing 240) and the treasury never piles: 61 money at
 * t=400, 57 at t=1500, +4/tick standing (86 taxes + 0 commerce − 67 upkeep −
 * 15 people), every coin having gone into 86 residences, 43 wells and 23 farms.
 * The surplus is a flow, not a stock — there is no sink to add.
 *
 * The crisis this comment first recorded on that line (money 0, water
 * production 0, pressure 100, 53 colonists unserved) was the GOVERNOR, not the
 * game: its food triage rested every well once food fell under pop × 2, which
 * disarmed the hydric reserve and blacked the colony out. Fixed in
 * `tests/selfplay.governor.ts` (Step084) and pinned by the self-play suite.
 */
export const CROWDING_FREE_POPULATION = 10;

export function crowdingCostPerTick(state: GameState): number {
  const above = state.population - CROWDING_FREE_POPULATION;
  if (above <= 0) return 0;
  return Math.floor(above / 5);
}

export function payMaintenance(state: GameState): number {
  const owed = maintenancePerTick(state);
  addMoney(state.resources, -owed); // clamps at 0: partial payment, never negative
  return owed;
}

/**
 * Emergency water bill, projection side (Step079 rule A): what the coming tick
 * will charge, on the same basis as `waterCoveragePercent` — the served count
 * of the water law, never a second estimate of the shortage. Zero below 75 and
 * zero when nobody is thirsty, so the panel can never announce a bill that is
 * not being paid.
 */
export function waterEmergencyCostPerTick(state: GameState): number {
  const served = waterServed(
    state.resources.water,
    waterProductionPerTick(state),
    state.population,
  );
  return waterEmergencyCost(state.waterPressure, state.population - served);
}

/**
 * The bill itself, in the money phase (Step079 rule B). `unservedThisTick` is
 * the tick's OWN served count (captured before admission, on the gauge's basis),
 * not a re-derivation: a colonist admitted this tick drinks from the next one.
 * addMoney clamps at 0, so an unpayable bill empties the treasury and stops
 * there — no debt, and the simulation keeps running (measured scenario 3).
 */
export function payWaterEmergency(state: GameState, unservedThisTick: number): number {
  const owed = waterEmergencyCost(state.waterPressure, unservedThisTick);
  addMoney(state.resources, -owed);
  return owed;
}

/** The people's upkeep, on top of the buildings' (Step072). */
export function payCrowding(state: GameState): number {
  const owed = crowdingCostPerTick(state);
  addMoney(state.resources, -owed);
  return owed;
}
