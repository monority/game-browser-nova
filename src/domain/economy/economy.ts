import type { GameState } from "../simulation/state.js";
import { isAdjacentToRoad } from "../network/network.js";
import { isActive } from "../building/building.js";
import { addMoney, deductFood } from "../resource/resource.js";
import { foodProductionPerTick, FOOD_PER_COLONIST_PER_TICK } from "../production/production.js";
import { techLevel } from "../progression/progression.js";

/**
 * Step001 money model (validated baseline):
 * revenue = 1 tax/inhabitant + 2 commerce per road-CONNECTED operational
 * Workshop (staffing-independent — vacant workshops still earn);
 * maintenance = 1 per operational building (roads excluded).
 * The treasury is uncapped, clamped >= 0 (accounted, not stored goods).
 * Same-tick revenue lands during the tick, before subsequent commands.
 */

export const TAX_PER_INHABITANT_PER_TICK = 1;
export const COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK = 2;
/**
 * Throughput bonus (D3/D6 re-anchoring, Step012): +1 per plank actually
 * produced this tick — commerce now grows with real transformation work.
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

export function connectedWorkshops(state: GameState): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type !== "workshop") continue;
    if (!isActive(building)) continue;
    if (!isAdjacentToRoad(state.roads, building.x, building.y)) continue;
    count += 1;
  }
  return count;
}

/**
 * Age 2 market economy (Phase 9, MVP market/basic commerce): each
 * operational road-connected Market sells up to 2 surplus food per tick
 * at 1 money each. Sales run inside revenue collection, after consumption
 * and admission, so markets liquidate leftovers and never starve colonists.
 */
export const FOOD_SOLD_PER_MARKET_PER_TICK = 2;
export const MONEY_PER_FOOD_SOLD = 1;

export function connectedMarkets(state: GameState): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type !== "market") continue;
    if (!isActive(building)) continue;
    if (!isAdjacentToRoad(state.roads, building.x, building.y)) continue;
    count += 1;
  }
  return count;
}

/** Pure forecast of next-tick market sales (food units, before pricing). */
export function expectedMarketSales(state: GameState): number {
  const markets = connectedMarkets(state);
  if (markets === 0) return 0;
  const requirement = state.population * FOOD_PER_COLONIST_PER_TICK;
  const available = state.resources.food + foodProductionPerTick(state);
  const leftover = available >= requirement ? available - requirement : 0;
  return Math.min(leftover, markets * FOOD_SOLD_PER_MARKET_PER_TICK);
}

/**
 * Tick-phase market sales: deducts sold food, returns units sold.
 * Pricing lands in collectRevenue (single money inflow, no double count).
 */
export function sellMarketSurplus(state: GameState): number {
  const markets = connectedMarkets(state);
  if (markets === 0) return 0;
  return deductFood(state.resources, markets * FOOD_SOLD_PER_MARKET_PER_TICK);
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
 * `planksProducedThisTick` is the actual transformation output this tick.
 */
export function commercePerTick(state: GameState, planksProducedThisTick = 0): number {
  const perWorkshop =
    COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK + techLevel(state, "workshopCommerce");
  return (
    (commerceUnlocked(state) ? connectedWorkshops(state) * perWorkshop : 0) +
    planksProducedThisTick * COMMERCE_PER_PLANK_PRODUCED_PER_TICK
  );
}

/** Maintenance owed per tick: non-exempt operational buildings (Step028 shared). */
export function maintenancePerTick(state: GameState): number {
  return operationalBuildingCount(state) * MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK;
}

export function collectRevenue(
  state: GameState,
  planksProducedThisTick = 0,
): { taxes: number; commerce: number; market: number } {
  const taxes = taxesPerTick(state);
  const commerce = commercePerTick(state, planksProducedThisTick);
  const marketFood = sellMarketSurplus(state);
  const market = marketFood * MONEY_PER_FOOD_SOLD;
  addMoney(state.resources, taxes + commerce + market);
  return { taxes, commerce, market };
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
