import { BUILDING_DEFINITIONS, type BuildingType } from "../../content/buildings.js";
import { cellKey } from "../shared/cells.js";
import { isBlocked } from "../world/world.js";
import { hasDepositAt } from "../world/deposits.js";
import { allRoadCells } from "../road/road.js";
import type { GameState } from "../simulation/state.js";

/** Placement validation is a pure domain check; deduction is atomic in the command layer. */

export type PlacementValidation =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unknownBuildingType"
        | "outOfBounds"
        | "blockedCell"
        | "occupied"
        | "depositBlocked"
        | "colonyCenterExists"
        | "insufficientMoney"
        | "insufficientWater";
    };

export function validatePlacement(
  state: GameState,
  type: string,
  x: number,
  y: number,
): PlacementValidation {
  const definition = BUILDING_DEFINITIONS[type as BuildingType];
  if (!definition) return { ok: false, reason: "unknownBuildingType" };

  // The Colony Center anchor is never player-placed (day-0 bootstrap).
  if (type === "colonyCenter") return { ok: false, reason: "colonyCenterExists" };

  if (x < 0 || y < 0 || x >= state.world.width || y >= state.world.height) {
    return { ok: false, reason: "outOfBounds" };
  }
  if (isBlocked(state.world, x, y)) {
    return { ok: false, reason: "blockedCell" };
  }
  // A building must never overwrite a world feature: a camp on its own
  // deposit could never extract.
  if (hasDepositAt(state.woodDeposits, x, y) || hasDepositAt(state.stoneDeposits, x, y)) {
    return { ok: false, reason: "depositBlocked" };
  }

  const key = cellKey(x, y);
  for (const building of Object.values(state.buildings)) {
    if (building.x === x && building.y === y) {
      return { ok: false, reason: "occupied" };
    }
  }
  if (allRoadCells(state.roads).has(key)) {
    return { ok: false, reason: "occupied" };
  }

  if (state.resources.money < definition.moneyCost) {
    return { ok: false, reason: "insufficientMoney" };
  }
  if (state.resources.water < definition.waterCost) {
    return { ok: false, reason: "insufficientWater" };
  }

  return { ok: true };
}

export type RoadValidation =
  | { ok: true }
  | {
      ok: false;
      reason: "outOfBounds" | "blockedCell" | "occupied" | "insufficientMoney" | "emptyPath";
    };

export function validateRoads(state: GameState, cells: readonly string[]): RoadValidation {
  if (cells.length === 0) return { ok: false, reason: "emptyPath" };

  const occupiedRoads = allRoadCells(state.roads);
  const seen = new Set<string>();
  for (const key of cells) {
    if (seen.has(key)) continue;
    seen.add(key);
    const { x, y } = parseKey(key);
    if (x < 0 || y < 0 || x >= state.world.width || y >= state.world.height) {
      return { ok: false, reason: "outOfBounds" };
    }
    if (isBlocked(state.world, x, y)) return { ok: false, reason: "blockedCell" };
    if (occupiedRoads.has(key)) return { ok: false, reason: "occupied" };
    for (const building of Object.values(state.buildings)) {
      if (building.x === x && building.y === y) return { ok: false, reason: "occupied" };
    }
  }

  const uniqueCount = seen.size;
  if (state.resources.money < uniqueCount * 5) {
    return { ok: false, reason: "insufficientMoney" };
  }
  return { ok: true };
}

function parseKey(key: string): { x: number; y: number } {
  const i = key.indexOf(",");
  if (i < 0) throw new Error(`invalid cell key: ${key}`);
  return { x: Number(key.slice(0, i)), y: Number(key.slice(i + 1)) };
}
