import { BUILDING_DEFINITIONS, type BuildingType } from "@/content/buildings.js";

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
  /**
   * Mothball state (Step009, user decision D1): inactive buildings pay no
   * maintenance, produce nothing, house no one, employ no one and earn no
   * commerce. Reactivation takes effect at the next simulation tick.
   */
  active: boolean;
}

/** Operational AND active: the filter every production/economy phase uses. */
export function isActive(building: Building): boolean {
  return building.status === "operational" && building.active;
}

/** Count operational + active buildings of one type (mothball removes them). */
export function countActiveOfType(
  buildings: Record<string, Building>,
  type: BuildingType,
  where?: (building: Building) => boolean,
): number {
  let count = 0;
  for (const building of Object.values(buildings)) {
    if (building.type !== type) continue;
    if (!isActive(building)) continue;
    if (where && !where(building)) continue;
    count += 1;
  }
  return count;
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
    active: true,
  };
}
