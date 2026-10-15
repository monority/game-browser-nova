import type { GameState } from "@/domain/simulation/state.js";
import {
  commercePerTick,
  connectedMarkets,
  connectedWorkshops,
  expectedMarketSales,
  maintenancePerTick,
  MONEY_PER_FOOD_SOLD,
  operationalBuildingCount,
  taxesPerTick,
} from "@/domain/economy/economy.js";
import { plankThroughput } from "@/domain/production/transformation.js";
import { housingCapacity } from "@/domain/population/population.js";
import { environmentalQuality } from "@/domain/environment/environment.js";

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
  // Honest money model (Step028): all rates come from the shared pure
  // economy functions, so the UI can never drift from the simulation.
  const taxes = taxesPerTick(state);
  const commerce = commercePerTick(state, plankThroughput(state));
  const market = expectedMarketSales(state) * MONEY_PER_FOOD_SOLD;
  const maintenance = maintenancePerTick(state);
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
