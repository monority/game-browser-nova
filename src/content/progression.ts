/**
 * Age + milestone content (docs/game/07-PROGRESSION.md): milestones are
 * evaluated from canonical facts (§13 — explainable: what is required,
 * current progress, what remains). Transition is player-triggered once
 * every milestone of the current age is done (§4 player agency).
 */

import type { BuildingType } from "./buildings.js";

export type MilestoneDimension = "population" | "buildings" | "treasury" | "techs";

export interface MilestoneDefinition {
  id: string;
  label: string;
  dimension: MilestoneDimension;
  threshold: number;
  /** Optional building-type filter (counts only matching active buildings). */
  buildingType?: BuildingType;
}

export const STARTING_AGE = 1;

export const AGE_NAMES: Record<number, string> = {
  1: "Age of Founding",
  2: "Age of Expansion",
  3: "Age of Prosperity",
};

/** Milestones per age. Advancing requires ALL of the current age's set. */
export const AGE_MILESTONES: Record<number, MilestoneDefinition[]> = {
  1: [
    { id: "pop8", label: "Population 8", dimension: "population", threshold: 8 },
    { id: "bld8", label: "8 operational buildings", dimension: "buildings", threshold: 8 },
    { id: "tre200", label: "Treasury 200", dimension: "treasury", threshold: 200 },
    { id: "tech3", label: "3 technologies researched", dimension: "techs", threshold: 3 },
  ],
  2: [
    { id: "pop15", label: "Population 15", dimension: "population", threshold: 15 },
    { id: "bld14", label: "14 operational buildings", dimension: "buildings", threshold: 14 },
    { id: "tre600", label: "Treasury 600", dimension: "treasury", threshold: 600 },
    { id: "tech5", label: "5 technologies researched", dimension: "techs", threshold: 5 },
    // Step024: Age-2 trade footprint. Count form (not cumulative sales)
    // so the milestone derives from buildings state with no migration.
    { id: "market1", label: "1 operational market", dimension: "buildings", threshold: 1, buildingType: "market" },
  ],
  // Step035: Age-3 prosperity. Thresholds from the measured sustained
  // endgame (pop24, money4000+, 56 buildings incl. 24 res / 12 farm /
  // 12 well / 4 shops, stable from t400): pop/treasury/buildings plus
  // housing and workshop counts, which never flap under mothball
  // cycling (farms/wells do — proven by manageMothballs rest logic).
  // No techs dimension: all 5 techs are already required by Age 2.
  // No market/warehouse: plank-starved endgames cannot guarantee them.
  3: [
    { id: "pop20", label: "Population 20", dimension: "population", threshold: 20 },
    { id: "tre1500", label: "Treasury 1500", dimension: "treasury", threshold: 1500 },
    { id: "bld30", label: "30 operational buildings", dimension: "buildings", threshold: 30 },
    { id: "res20", label: "20 residences", dimension: "buildings", threshold: 20, buildingType: "residence" },
    { id: "shop3", label: "3 operational workshops", dimension: "buildings", threshold: 3, buildingType: "workshop" },
  ],
};
