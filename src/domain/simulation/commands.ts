import { BUILDING_DEFINITIONS, ROAD_MONEY_COST_PER_CELL, type BuildingType } from "../../content/buildings.js";
import { validatePlacement, validateRoads, type PlacementValidation, type RoadValidation } from "../building/placement.js";
import { createBuilding } from "../building/building.js";
import { createRoad } from "../road/road.js";
import { parseCellKey } from "../shared/cells.js";
import type { GameState } from "./state.js";

/**
 * Explicit command layer (docs/DATA-CONTRACTS.md §4).
 * Validation precedes mutation; deduction is atomic per command.
 * Same-tick revenue has already landed before commands execute
 * (established money-model contract), so affordability is a direct check.
 */

export type Command =
  | { kind: "placeBuilding"; type: BuildingType; x: number; y: number }
  | { kind: "placeRoads"; cells: readonly string[] };

export type CommandResult =
  | { ok: true }
  | { ok: false; reason: string };

export function applyCommand(state: GameState, command: Command): CommandResult {
  switch (command.kind) {
    case "placeBuilding":
      return applyPlaceBuilding(state, command.type, command.x, command.y);
    case "placeRoads":
      return applyPlaceRoads(state, command.cells);
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
