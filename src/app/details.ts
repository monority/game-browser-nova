import type { BuildingType } from "../content/buildings.js";

/** Per-type inspection detail (presentation copy, no simulation rules). */

export const BUILDING_DETAIL: Record<BuildingType, string> = {
  residence: "Houses 1 colonist",
  farm: "+2 food/tick when staffed",
  well: "+2 water/tick when staffed",
  workshop: "+2 commerce/tick connected · 2 Wood → 1 Plank when staffed",
  lumberCamp: "+2 Wood/tick from adjacent deposits (staffed)",
  quarry: "+2 Stone/tick from adjacent deposits (staffed)",
  colonyCenter: "+1 Wood/tick · always active · cannot be removed or mothballed",
};
