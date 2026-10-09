import type { GameState } from "../../domain/simulation/state.js";
import {
  connectedWorkshops,
  operationalBuildingCount,
} from "../../domain/economy/economy.js";
import {
  COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK,
  MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK,
  TAX_PER_INHABITANT_PER_TICK,
} from "../../domain/economy/economy.js";
import { housingCapacity } from "../../domain/population/population.js";

/** Derived read-only view for the UI (queries never mutate state). */

export interface ColonyStats {
  tick: number;
  population: number;
  housingCapacity: number;
  resources: GameState["resources"];
  taxesPerTick: number;
  commercePerTick: number;
  revenuePerTick: number;
  maintenancePerTick: number;
  netMoneyPerTick: number;
  connectedWorkshops: number;
  operationalBuildings: number;
}

export function getColonyStats(state: GameState): ColonyStats {
  const taxes = state.population * TAX_PER_INHABITANT_PER_TICK;
  const commerce = connectedWorkshops(state) * COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK;
  const maintenance = operationalBuildingCount(state) * MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK;
  return {
    tick: state.tick,
    population: state.population,
    housingCapacity: housingCapacity(state),
    resources: { ...state.resources },
    taxesPerTick: taxes,
    commercePerTick: commerce,
    revenuePerTick: taxes + commerce,
    maintenancePerTick: maintenance,
    netMoneyPerTick: taxes + commerce - maintenance,
    connectedWorkshops: connectedWorkshops(state),
    operationalBuildings: operationalBuildingCount(state),
  };
}
