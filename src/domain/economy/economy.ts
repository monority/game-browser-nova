import type { GameState } from "../simulation/state.js";
import { isAdjacentToRoad } from "../network/network.js";
import { addMoney } from "../resource/resource.js";

/**
 * Step001 money model (validated baseline):
 * revenue = 1 tax/inhabitant + 2 commerce per road-CONNECTED operational
 * Workshop (staffing-independent — vacant workshops still earn);
 * maintenance = 1 per operational building (roads excluded).
 * The treasury is uncapped, clamped >= 0 (accounted, not stored goods).
 * Same-tick revenue lands during the tick, before subsequent commands.
 */

export const TAX_PER_INHABITANT_PER_TICK = 1;
export const COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK = 2;
export const MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK = 1;

export function connectedWorkshops(state: GameState): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type !== "workshop") continue;
    if (building.status !== "operational") continue;
    if (!isAdjacentToRoad(state.roads, building.x, building.y)) continue;
    count += 1;
  }
  return count;
}

export function collectRevenue(state: GameState): { taxes: number; commerce: number } {
  const taxes = state.population * TAX_PER_INHABITANT_PER_TICK;
  const commerce = connectedWorkshops(state) * COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK;
  addMoney(state.resources, taxes + commerce);
  return { taxes, commerce };
}

export function operationalBuildingCount(state: GameState): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.status === "operational") count += 1;
  }
  return count;
}

export function payMaintenance(state: GameState): number {
  const owed = operationalBuildingCount(state) * MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK;
  addMoney(state.resources, -owed); // clamps at 0: partial payment, never negative
  return owed;
}
