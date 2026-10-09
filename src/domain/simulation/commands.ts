import { BUILDING_DEFINITIONS, ROAD_MONEY_COST_PER_CELL, type BuildingType } from "../../content/buildings.js";
import { validatePlacement, validateRoads, validateRemoval, validateRoadRemoval, validateSetActivation, type PlacementValidation, type RoadValidation, type RemovalValidation, type RoadRemovalValidation, type ActivationValidation } from "../building/placement.js";
import { createBuilding } from "../building/building.js";
import { createRoad } from "../road/road.js";
import { parseCellKey } from "../shared/cells.js";
import { deductPlanks } from "../resource/resource.js";
import type { GameState } from "./state.js";

/**
 * Explicit command layer (docs/DATA-CONTRACTS.md §4).
 * Validation precedes mutation; deduction is atomic per command.
 * Same-tick revenue has already landed before commands execute
 * (established money-model contract), so affordability is a direct check.
 */

export type Command =
  | { kind: "placeBuilding"; type: BuildingType; x: number; y: number }
  | { kind: "placeRoads"; cells: readonly string[] }
  | { kind: "removeBuilding"; id: string }
  | { kind: "removeRoads"; cells: readonly string[] }
  | { kind: "setBuildingActive"; id: string; active: boolean };

export type CommandResult =
  | { ok: true }
  | { ok: false; reason: string };

export function applyCommand(state: GameState, command: Command): CommandResult {
  switch (command.kind) {
    case "placeBuilding":
      return applyPlaceBuilding(state, command.type, command.x, command.y);
    case "placeRoads":
      return applyPlaceRoads(state, command.cells);
    case "removeBuilding":
      return applyRemoveBuilding(state, command.id);
    case "removeRoads":
      return applyRemoveRoads(state, command.cells);
    case "setBuildingActive":
      return applySetBuildingActive(state, command.id, command.active);
  }
}

function applyPlaceBuilding(
  state: GameState,
  type: BuildingType,
  x: number,
  y: number,
): CommandResult {
  const validation: PlacementValidation = validatePlacement(state, type, x, y);
  if (!validation.ok) return validation;

  const definition = BUILDING_DEFINITIONS[type];
  state.resources.money -= definition.moneyCost;
  state.resources.water = Math.max(0, state.resources.water - definition.waterCost);
  deductPlanks(state.resources, definition.plankCost); // atomic, clamped >= 0

  const id = `building-${state.buildingCounter}`;
  state.buildingCounter += 1;
  state.buildings[id] = createBuilding(id, type, x, y);
  return { ok: true };
}

function applyPlaceRoads(state: GameState, cells: readonly string[]): CommandResult {
  const validation: RoadValidation = validateRoads(state, cells);
  if (!validation.ok) return validation;

  const unique = [...new Set(cells)].sort((a, b) => {
    const pa = parseCellKey(a);
    const pb = parseCellKey(b);
    return pa.y - pb.y || pa.x - pb.x;
  });

  state.resources.money -= unique.length * ROAD_MONEY_COST_PER_CELL;

  const id = `road-${state.roadCounter}`;
  state.roadCounter += 1;
  state.roads[id] = createRoad(id, unique);
  return { ok: true };
}

/** Removal is free (no refund policy): relief comes from stopped maintenance. */
function applyRemoveBuilding(state: GameState, id: string): CommandResult {
  const validation: RemovalValidation = validateRemoval(state, id);
  if (!validation.ok) return validation;
  delete state.buildings[id];
  return { ok: true };
}

function applyRemoveRoads(state: GameState, cells: readonly string[]): CommandResult {
  const validation: RoadRemovalValidation = validateRoadRemoval(state, cells);
  if (!validation.ok) return validation;

  for (const key of new Set(cells)) {
    for (const [roadId, road] of Object.entries(state.roads)) {
      if (!road.cells.includes(key)) continue;
      road.cells = road.cells.filter((c) => c !== key);
      if (road.cells.length === 0) delete state.roads[roadId];
      break;
    }
  }
  return { ok: true };
}

/**
 * Mothball toggle (Step009). The flag flips immediately; all economic
 * effects (maintenance relief, lost output) land at the next simulation
 * tick's phases — no same-tick exploit. Reactivation is free; the cost is
 * the lost output during inactivity.
 */
function applySetBuildingActive(state: GameState, id: string, active: boolean): CommandResult {
  const validation: ActivationValidation = validateSetActivation(state, id);
  if (!validation.ok) return validation;
  const building = state.buildings[id];
  if (!building) return { ok: false, reason: "unknownBuilding" };
  building.active = active;
  if (!active) building.staffed = false; // production reads active anyway; keep flags honest
  return { ok: true };
}
