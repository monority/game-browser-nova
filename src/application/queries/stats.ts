import type { GameState } from "@/domain/simulation/state.js";
import {
  commercePerTick,
  connectedWorkshops,
  maintenancePerTick,
  operationalBuildingCount,
  taxesPerTick,
} from "@/domain/economy/economy.js";
import { plankThroughput } from "@/domain/production/transformation.js";
import { housingCapacity } from "@/domain/population/population.js";
import {
  environmentalQuality,
  pollutionFlows,
  pollutionTicksToAdmissionBlock,
} from "@/domain/environment/environment.js";
import { foodCapacity, waterCapacity } from "@/domain/storage/storage.js";
import { getStaffingOverview } from "./staffing.js";

/** Derived read-only view for the UI (queries never mutate state). */

export interface ColonyStats {
  tick: number;
  population: number;
  housingCapacity: number;
  foodCapacity: number;
  waterCapacity: number;
  resources: GameState["resources"];
  /** Workforce fact (Step057 F5): replaces the former permanent alert. */
  staffedWorkplaces: number;
  eligibleWorkplaces: number;
  pollution: number;
  envQuality: number;
  pollutionEmissionsPerTick: number;
  pollutionAbsorptionPerTick: number;
  pollutionNetPerTick: number;
  /** Ticks until air quality closes admission; null while pollution falls. */
  pollutionTicksToAdmissionBlock: number | null;
  taxesPerTick: number;
  commercePerTick: number;
  revenuePerTick: number;
  maintenancePerTick: number;
  netMoneyPerTick: number;
  connectedWorkshops: number;
  operationalBuildings: number;
}

export function getColonyStats(state: GameState): ColonyStats {
  // Honest money model (Step028): all rates come from the shared pure
  // economy functions, so the UI can never drift from the simulation.
  const taxes = taxesPerTick(state);
  const commerce = commercePerTick(state, plankThroughput(state));
  const maintenance = maintenancePerTick(state);
  const pollution = pollutionFlows(state);
  const staffing = getStaffingOverview(state);
  return {
    tick: state.tick,
    population: state.population,
    housingCapacity: housingCapacity(state),
    foodCapacity: foodCapacity(state),
    waterCapacity: waterCapacity(state),
    resources: { ...state.resources },
    staffedWorkplaces: staffing.staffed,
    eligibleWorkplaces: staffing.eligible,
    pollution: state.pollution,
    envQuality: environmentalQuality(state),
    pollutionEmissionsPerTick: pollution.emissions,
    pollutionAbsorptionPerTick: pollution.absorption,
    pollutionNetPerTick: pollution.net,
    pollutionTicksToAdmissionBlock: pollutionTicksToAdmissionBlock(state),
    taxesPerTick: taxes,
    commercePerTick: commerce,
    revenuePerTick: taxes + commerce,
    maintenancePerTick: maintenance,
    netMoneyPerTick: taxes + commerce - maintenance,
    connectedWorkshops: connectedWorkshops(state),
    operationalBuildings: operationalBuildingCount(state),
  };
}
