import type { GameState } from "@/domain/simulation/state.js";
import { isAdjacentToRoad } from "@/domain/network/network.js";
import { countActiveOfType, isActive } from "@/domain/building/building.js";
import type { BuildingType } from "@/content/buildings.js";
import { addMoney, deductFood } from "@/domain/resource/resource.js";
import { foodProductionPerTick, FOOD_PER_COLONIST_PER_TICK } from "@/domain/production/production.js";
import { techLevel } from "@/domain/progression/progression.js";
import { isEventActive } from "@/domain/events/events.js";

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
 * Age 2 market economy (Phase 9, MVP market/basic commerce): each
 * operational road-connected Market sells up to 2 food per tick at 1 money
 * each — food the colony can SPARE, meaning whatever the granary holds above
 * one tick of consumption. Sales run inside revenue collection, after
 * consumption, admission and the Step031 clamp.
 *
 * Step062 decision (measured bug, Step061): the old rule took whatever stock
 * existed, so a colony at food balance 0 drained its granary (120 → 0 in 60
 * ticks, 20 colonists unfed) and starved — contradicting this module's
 * "never starve colonists" contract. The safety stock fixes that at the
 * cause: trade can spend the buffer, never the next meal. Markets stay a
 * real income line (food stock → money, refilled by overproduction); a
 * "flow surplus only" alternative was measured and rejected because a
 * market then earns nothing unless a worker farms purely to sell (2/tick vs
 * a workshop's 3/tick), which made the whole Age 2 building dominated.
 */
export const FOOD_SOLD_PER_MARKET_PER_TICK = 2;
export const MONEY_PER_FOOD_SOLD = 1;

export function connectedMarkets(state: GameState): number {
  return countConnectedOfType(state, "market");
}

/**
 * Food the colony must keep to feed itself next tick. A market never sells
 * below it: trade can drain the granary, never empty it.
 */
export function marketSafetyStock(state: GameState): number {
  return state.population * FOOD_PER_COLONIST_PER_TICK;
}

/**
 * Sellable food right now: what the granary holds above the safety stock.
 * Read on post-consumption state (phase 9) it is exactly what the market may
 * sell; shared with the forecast so the two cannot drift.
 */
export function marketableFood(state: GameState): number {
  return Math.max(0, state.resources.food - marketSafetyStock(state));
}

/**
 * Pure forecast of market sales (food units, before pricing).
 * Read on pre-tick state it equals what the market will sell this tick;
 * read on post-tick state it projects next-tick sales. The UI calls it
 * post-tick, so the drain shown is next tick's.
 *
 * Mirrors the tick phases (production, consumption, Step031 clamp, then the
 * sale): the market sells what survives the meal and the safety stock. No
 * storage-cap term — a sale can never exceed the stock it leaves behind.
 */
export function expectedMarketSales(state: GameState): number {
  const markets = connectedMarkets(state);
  if (markets === 0) return 0;
  const need = marketSafetyStock(state); // the colonists who eat this tick
  const afterMeal = state.resources.food + foodProductionPerTick(state) - need;
  return Math.min(
    Math.max(0, afterMeal - need), // keep as much, sell the rest
    markets * FOOD_SOLD_PER_MARKET_PER_TICK,
  );
}

/**
 * Tick-phase market sales: deducts sold food, returns units sold. Pricing
 * lands in collectRevenue (single money inflow, no double count).
 */
export function sellMarketSurplus(state: GameState): number {
  const markets = connectedMarkets(state);
  if (markets === 0) return 0;
  return deductFood(
    state.resources,
    Math.min(marketableFood(state), markets * FOOD_SOLD_PER_MARKET_PER_TICK),
  );
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
