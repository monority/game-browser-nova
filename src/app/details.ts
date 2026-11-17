import type { BuildingType } from "@/content/buildings.js";

/** Per-type inspection detail (presentation copy, no simulation rules). */

export const BUILDING_DETAIL: Record<BuildingType, string> = {
  residence: "Houses 1 colonist",
  farm: "+2 food/tick when staffed (tech adds more)",
  well: "+2 water/tick when staffed",
  workshop: "+2 commerce/tick when connected (works without workers) · +1/tick while producing planks · 2 Wood → 1 Plank · emits 1 pollution/tick",
  lumberCamp: "+2 Wood/tick from adjacent deposits (staffed)",
  quarry: "+2 Stone/tick from adjacent deposits (staffed; tech adds more) · emits pollution",
  park: "Absorbs 2 pollution/tick, regrows 1 adjacent wood/tick",
  warehouse: "+60 food / +40 water storage (base 180/80) · unstaffed",
  colonyCenter: "+1 Wood/tick · always active · cannot be removed or mothballed",
};
