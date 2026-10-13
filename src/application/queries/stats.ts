import type { GameState } from "../../domain/simulation/state.js";
import {
  commerceUnlocked,
  connectedMarkets,
  connectedWorkshops,
  expectedMarketSales,
  operationalBuildingCount,
  COMMERCE_PER_PLANK_PRODUCED_PER_TICK,
  MONEY_PER_FOOD_SOLD,
} from "../../domain/economy/economy.js";
import { techLevel } from "../../domain/progression/progression.js";
import { plankThroughput } from "../../domain/production/transformation.js";
import {
  COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK,
  MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK,
  TAX_PER_INHABITANT_PER_TICK,
} from "../../domain/economy/economy.js";
import { housingCapacity } from "../../domain/population/population.js";
import { environmentalQuality } from "../../domain/environment/environment.js";

/** Derived read-only view for the UI (queries never mutate state). */

export interface ColonyStats {
  tick: number;
  population: number;
  housingCapacity: number;
  resources: GameState["resources"];
  pollution: number;
  envQuality: number;
  taxesPerTick: number;
  commercePerTick: number;
  marketPerTick: number;
  revenuePerTick: number;
  maintenancePerTick: number;
  netMoneyPerTick: number;
  connectedWorkshops: number;
  connectedMarkets: number;
  operationalBuildings: number;
}

export function getColonyStats(state: GameState): ColonyStats {
  const taxes = state.population * TAX_PER_INHABITANT_PER_TICK;
  // Honest commerce: connection base (pop-gated, Step021) plus tradeRoutes
  // tech plus plank throughput (Step017, always on). Mirrors collectRevenue.
  const commerce =
    (commerceUnlocked(state)
      ? connectedWorkshops(state) *
        (COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK + techLevel(state, "workshopCommerce"))
      : 0) +
    plankThroughput(state) * COMMERCE_PER_PLANK_PRODUCED_PER_TICK;
  const market = expectedMarketSales(state) * MONEY_PER_FOOD_SOLD;
  const maintenance = operationalBuildingCount(state) * MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK;
  return {
    tick: state.tick,
    population: state.population,
    housingCapacity: housingCapacity(state),
    resources: { ...state.resources },
    pollution: state.pollution,
    envQuality: environmentalQuality(state),
    taxesPerTick: taxes,
    commercePerTick: commerce,
    marketPerTick: market,
    revenuePerTick: taxes + commerce + market,
    maintenancePerTick: maintenance,
    netMoneyPerTick: taxes + commerce + market - maintenance,
    connectedWorkshops: connectedWorkshops(state),
    connectedMarkets: connectedMarkets(state),
    operationalBuildings: operationalBuildingCount(state),
  };
}
