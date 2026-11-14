/**
 * Age + milestone content (docs/game/07-PROGRESSION.md): milestones are
 * evaluated from canonical facts (§13 — explainable: what is required,
 * current progress, what remains). Transition is player-triggered once
 * every milestone of the current age is done (§4 player agency).
 */

import type { BuildingType } from "./buildings.js";

export type MilestoneDimension = "population" | "buildings" | "treasury" | "techs" | "stock";

export interface MilestoneDefinition {
  id: string;
  label: string;
  dimension: MilestoneDimension;
  threshold: number;
  /** Optional building-type filter (counts only matching active buildings). */
  buildingType?: BuildingType;
  /** Required by the `stock` dimension: which stored good the age asks for. */
  resource?: "food" | "water" | "wood" | "stone" | "planks";
}

export const STARTING_AGE = 1;

export const AGE_NAMES: Record<number, string> = {
  1: "Age of Founding",
  2: "Age of Expansion",
  3: "Age of Prosperity",
};

/**
 * Milestones per age. Advancing requires ALL of the current age's set.
 *
 * Step070: the treasury thresholds are gone. Money is the currency you BUILD
 * with — asking a player to sit on 600 of it was asking them to stop playing
 * for a while, and it said nothing about the colony. An age is now entered on
 * people and on a granary that actually holds: the same question the season
 * asks every winter, measured at the moment the player chooses to move on.
 * The `treasury` dimension stays supported (it is a canonical fact) but no age
 * gates on it, so no age can be bought.
 */
export const AGE_MILESTONES: Record<number, MilestoneDefinition[]> = {
  1: [
    { id: "pop8", label: "Population 8", dimension: "population", threshold: 8 },
    { id: "bld8", label: "8 operational buildings", dimension: "buildings", threshold: 8 },
    { id: "food30", label: "Food 30", dimension: "stock", threshold: 30, resource: "food" },
    { id: "tech3", label: "3 technologies researched", dimension: "techs", threshold: 3 },
  ],
  2: [
    { id: "pop15", label: "Population 15", dimension: "population", threshold: 15 },
    { id: "bld14", label: "14 operational buildings", dimension: "buildings", threshold: 14 },
    { id: "food90", label: "Food 90", dimension: "stock", threshold: 90, resource: "food" },
    { id: "tech5", label: "5 technologies researched", dimension: "techs", threshold: 5 },
    // Step065: the market milestone went with the market itself. Age 2 is
    // again the four Step021 dimensions (pop / buildings / food / techs).
  ],
  // Step035: Age-3 prosperity. Thresholds from the measured sustained
  // endgame (pop24, money4000+, 56 buildings incl. 24 res / 12 farm /
  // 12 well / 4 shops, stable from t400): pop/treasury/buildings plus
  // housing and workshop counts, which never flap under mothball
  // cycling (farms/wells do — proven by manageMothballs rest logic).
  // No techs dimension: all 5 techs are already required by Age 2.
  // No warehouse: plank-starved endgames cannot guarantee it.
  3: [
    { id: "pop20", label: "Population 20", dimension: "population", threshold: 20 },
    // A full base granary: the proof that the colony can carry itself through
    // a lean season without a warehouse bailing it out.
    { id: "food120", label: "Food 120", dimension: "stock", threshold: 120, resource: "food" },
    { id: "bld30", label: "30 operational buildings", dimension: "buildings", threshold: 30 },
    { id: "res20", label: "20 residences", dimension: "buildings", threshold: 20, buildingType: "residence" },
    // Step070 dropped the THREE-WORKSHOP gate. Once colonists work the farms
    // and the wells first (they are what a lean season threatens), a workshop
    // only opens when the colony has workers to spare, and the measured
    // self-play endgame — 24 colonists, 8 farms, 13 wells, granary 203, no
    // famine — has none: the gate asked for the one thing the colony could
    // afford to leave shut. Commerce is still how money is made; it is no
    // longer a condition for entering the age.
  ],
};
