/**
 * Building catalog — content, not rules (docs/CODE-STRUCTURE.md §6).
 * Costs are money (Step001 model). Values mirror the validated contract:
 * 25 money/building, 2-tick construction, capacity-1 workplaces,
 * capacity-1 residences, Workshop placement costs 1 Water.
 */

export type BuildingType =
  | "residence"
  | "farm"
  | "well"
  | "workshop"
  | "lumberCamp"
  | "quarry"
  | "colonyCenter";

export interface BuildingDefinition {
  type: BuildingType;
  displayName: string;
  constructionTicks: number;
  moneyCost: number;
  /** One-off plank cost (physical materials, Step006). */
  plankCost: number;
  /** One-off water consumed on placement. */
  waterCost: number;
  /** Workplace job slots (staffing requires a road connection). */
  jobCapacity: number;
  /** Housing slots (admission gating lives in the population slice). */
  housingCapacity: number;
}

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  residence: {
    type: "residence",
    displayName: "Residence",
    constructionTicks: 2,
    moneyCost: 25,
    plankCost: 0,
    waterCost: 0,
    jobCapacity: 0,
    housingCapacity: 1,
  },
  farm: {
    type: "farm",
    displayName: "Farm",
    constructionTicks: 2,
    moneyCost: 25,
    plankCost: 0,
    waterCost: 0,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  well: {
    type: "well",
    displayName: "Well",
    constructionTicks: 2,
    moneyCost: 25,
    plankCost: 0,
    waterCost: 0,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  workshop: {
    type: "workshop",
    displayName: "Workshop",
    constructionTicks: 2,
    moneyCost: 25,
    plankCost: 0,
    waterCost: 1,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  lumberCamp: {
    type: "lumberCamp",
    displayName: "Lumber Camp",
    constructionTicks: 2,
    moneyCost: 25,
    plankCost: 0,
    waterCost: 0,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  quarry: {
    type: "quarry",
    displayName: "Quarry",
    constructionTicks: 2,
    moneyCost: 25,
    // narrow downstream plank use (Step006): exactly one building
    plankCost: 5,
    waterCost: 0,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  colonyCenter: {
    type: "colonyCenter",
    displayName: "Colony Center",
    constructionTicks: 2,
    moneyCost: 25,
    plankCost: 0,
    waterCost: 0,
    // NOT a workplace by contract: primitive collection is unstaffed.
    jobCapacity: 0,
    housingCapacity: 0,
  },
};

export const ROAD_MONEY_COST_PER_CELL = 5;
