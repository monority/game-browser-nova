import { BUILDING_DEFINITIONS, type BuildingType } from "../../content/buildings.js";

export type BuildingStatus = "underConstruction" | "operational";

export interface Building {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  status: BuildingStatus;
  /** Ticks remaining until operational (only meaningful while under construction). */
  constructionTicksLeft: number;
  /** Written by the assignJobs phase; read by production next tick. */
  staffed: boolean;
}

export function createBuilding(id: string, type: BuildingType, x: number, y: number): Building {
  const definition = BUILDING_DEFINITIONS[type];
  return {
    id,
    type,
    x,
    y,
    status: definition.constructionTicks > 0 ? "underConstruction" : "operational",
    constructionTicksLeft: definition.constructionTicks,
    staffed: false,
  };
}

export function isOperational(building: Building): boolean {
  return building.status === "operational";
}
