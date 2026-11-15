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
import { projectFoodTick } from "@/domain/storage/spoilage.js";
import { currentSeason, ticksLeftInSeason } from "@/domain/season/season.js";
import { workingFarms } from "@/domain/production/production.js";
import { forecastFoodReserve, type FoodReserveStatus } from "@/domain/storage/reserve.js";
import type { TickFlows } from "@/domain/simulation/tick.js";
import { getStaffingOverview } from "./staffing.js";

/** Derived read-only view for the UI (queries never mutate state). */

export interface ColonyStats {
  tick: number;
  population: number;
  /** Step070: the season the clock is in, and how long it lasts. */
  seasonLabel: string;
  seasonTicksLeft: number;
  /** The lean season: the harvest runs only as far as the granary pays. */
  seasonLean: boolean;
  /** Farms that work this tick, out of those staffed (differs in the lean season). */
  workingFarms: number;
  housingCapacity: number;
  foodCapacity: number;
  waterCapacity: number;
  resources: GameState["resources"];
  /**
   * Conservation loss the coming tick will apply (Step067; exact post-harvest
   * basis since Step069, the same number the forecast reads).
   */
  foodSpoilagePerTick: number;
  /** Food destroyed by the storage cap on the LAST tick; 0 before any tick. */
  foodLostPerTick: number;
  /**
   * Step069: the Step068 reserve as the production actually holds it, in
   * ticks of consumption (`equilibrium / need`) — the number the doctrine is
   * written in. Null when the colony has no consumption to measure against.
   */
  foodReserveTicks: number | null;
  /** Target the reserve is measured against (`FOOD_RESERVE_TICKS`). */
  foodReserveTargetTicks: number;
  /** deficit / storage-limited / thin / building / funded. */
  foodReserveStatus: FoodReserveStatus;
  /** Water destroyed by the storage cap on the LAST tick. */
  waterLostPerTick: number;
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

/**
 * `flows` are the measurements of the last tick (Step067). Optional: without
 * them the per-tick losses read 0 rather than being invented — the canonical
 * stocks are unaffected either way.
 */
export function getColonyStats(state: GameState, flows?: TickFlows): ColonyStats {
  // Honest money model (Step028): all rates come from the shared pure
  // economy functions, so the UI can never drift from the simulation.
  const taxes = taxesPerTick(state);
  const commerce = commercePerTick(state, plankThroughput(state));
  const maintenance = maintenancePerTick(state);
  const pollution = pollutionFlows(state);
  const staffing = getStaffingOverview(state);
  const reserve = forecastFoodReserve(state);
  const season = currentSeason(state);
  return {
    tick: state.tick,
    population: state.population,
    seasonLabel: season.label,
    seasonTicksLeft: ticksLeftInSeason(state.tick),
    seasonLean: season.lean,
    workingFarms: workingFarms(state),
    housingCapacity: housingCapacity(state),
    foodCapacity: foodCapacity(state),
    waterCapacity: waterCapacity(state),
    resources: { ...state.resources },
    foodSpoilagePerTick: projectFoodTick(state).spoiled,
    foodLostPerTick: flows?.foodWasted ?? 0,
    foodReserveTicks:
      reserve.consumptionPerTick > 0 ? reserve.equilibrium / reserve.consumptionPerTick : null,
    foodReserveTargetTicks: reserve.targetTicks,
    foodReserveStatus: reserve.status,
    waterLostPerTick: flows?.waterWasted ?? 0,
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
