/**
 * Building catalog — content, not rules (docs/CODE-STRUCTURE.md §6).
 * Costs are materials first (D3, 2026-11-20): housing and production buildings
 * are paid in planks, heavy buildings add stone, and money pays infrastructure
 * and civic buildings only. Material costs stay alongside the unchanged
 * contract: 2-tick construction, capacity-1 workplaces, capacity-1 residences,
 * Workshop placement costs 1 Water.
 */

export type BuildingType =
  | "residence"
  | "farm"
  | "well"
  | "workshop"
  | "lumberCamp"
  | "quarry"
  | "park"
  | "warehouse"
  | "colonyCenter";

export interface BuildingDefinition {
  type: BuildingType;
  displayName: string;
  constructionTicks: number;
  moneyCost: number;
  /** One-off plank cost (physical materials, Step006). */
  plankCost: number;
  /**
   * One-off stone cost (heavy buildings, D3 2026-11-20). The quarry is never
   * charged stone: it is the only producer, so charging it would be a loop.
   */
  stoneCost: number;
  /** One-off water consumed on placement. */
  waterCost: number;
  /** Workplace job slots (staffing requires a road connection). */
  jobCapacity: number;
  /** Housing slots (admission gating lives in the population slice). */
  housingCapacity: number;
  /** Minimum age required to place this building (default 1). */
  requiredAge?: number;
}

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  residence: {
    type: "residence",
    displayName: "Residence",
    constructionTicks: 2,
    // Housing is built from planks, never from money (D3).
    moneyCost: 0,
    plankCost: 1,
    stoneCost: 0,
    waterCost: 0,
    jobCapacity: 0,
    housingCapacity: 1,
  },
  farm: {
    type: "farm",
    displayName: "Farm",
    constructionTicks: 2,
    moneyCost: 0,
    plankCost: 1,
    stoneCost: 0,
    waterCost: 0,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  well: {
    type: "well",
    displayName: "Well",
    constructionTicks: 2,
    // Infrastructure, paid in money (D3): a well built from planks would make
    // water depend on planks while planks depend on water — measured deadlock
    // at t=450 (water 0, workshops resting, planks 0, no well affordable).
    moneyCost: 25,
    plankCost: 0,
    stoneCost: 0,
    waterCost: 0,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  workshop: {
    type: "workshop",
    displayName: "Workshop",
    constructionTicks: 2,
    moneyCost: 0,
    // Transformation costs more than extraction: it also needs 1 Water.
    plankCost: 2,
    stoneCost: 0,
    waterCost: 1,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  lumberCamp: {
    type: "lumberCamp",
    displayName: "Lumber Camp",
    constructionTicks: 2,
    moneyCost: 0,
    plankCost: 1,
    stoneCost: 0,
    waterCost: 0,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  quarry: {
    type: "quarry",
    displayName: "Quarry",
    constructionTicks: 2,
    moneyCost: 0,
    // The bootstrap building: planks only, never stone.
    plankCost: 4,
    stoneCost: 0,
    waterCost: 0,
    jobCapacity: 1,
    housingCapacity: 0,
  },
  colonyCenter: {
    type: "colonyCenter",
    displayName: "Colony Center",
    constructionTicks: 2,
    // Day-0 anchor, never player-placed.
    moneyCost: 0,
    plankCost: 0,
    stoneCost: 0,
    waterCost: 0,
    // NOT a workplace by contract: primitive collection is unstaffed.
    jobCapacity: 0,
    housingCapacity: 0,
  },
  park: {
    type: "park",
    displayName: "Park",
    constructionTicks: 2,
    // Civic: the one Age-1 building still bought with money (D3).
    moneyCost: 25,
    plankCost: 0,
    stoneCost: 0,
    waterCost: 0,
    // absorbs pollution (environment system, Step014)
    jobCapacity: 0,
    housingCapacity: 0,
  },
  warehouse: {
    type: "warehouse",
    displayName: "Warehouse",
    constructionTicks: 2,
    moneyCost: 0,
    // industry-gated storage (Step031): expanding past the colony base
    // requires planks, so storage competes with construction.
    plankCost: 2,
    // The first heavy building: it is where stone starts being spent (D3).
    stoneCost: 8,
    waterCost: 0,
    // passive capacity, no jobs.
    jobCapacity: 0,
    housingCapacity: 0,
  },
};

export const ROAD_MONEY_COST_PER_CELL = 5;
