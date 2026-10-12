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
        | "ageLocked"
        | "insufficientMoney"
        | "insufficientWater"
        | "insufficientPlanks";
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

  // Age-gated buildings (Phase 9: Market unlocks in Age 2).
  if ((definition.requiredAge ?? 1) > state.age) {
    return { ok: false, reason: "ageLocked" };
  }

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
  // Planks are never masked by same-tick revenue: direct stock check
  // (mirrors the Water rule, Step006).
  if (state.resources.planks < definition.plankCost) {
    return { ok: false, reason: "insufficientPlanks" };
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

/** Removal validation (MVP "removal" scope; no refund policy). */

export type RemovalValidation =
  | { ok: true }
  | { ok: false; reason: "unknownBuilding" | "anchorProtected" };

export function validateRemoval(state: GameState, id: string): RemovalValidation {
  const building = state.buildings[id];
  if (!building) return { ok: false, reason: "unknownBuilding" };
  // The Colony Center is the day-0 anti-self-lock anchor and must never be
  // removable (Step004 protection).
  if (building.type === "colonyCenter") return { ok: false, reason: "anchorProtected" };
  return { ok: true };
}

/** Mothball activation validation (Step009). The anchor is always active. */
export type ActivationValidation =
  | { ok: true }
  | { ok: false; reason: "unknownBuilding" | "anchorProtected" };

export function validateSetActivation(
  state: GameState,
  id: string,
): ActivationValidation {
  const building = state.buildings[id];
  if (!building) return { ok: false, reason: "unknownBuilding" };
  // Billing/protecting the recovery capability was settled in Step004:
  // the Colony Center is always active and can never be mothballed.
  if (building.type === "colonyCenter") return { ok: false, reason: "anchorProtected" };
  return { ok: true };
}

export type RoadRemovalValidation =
  | { ok: true }
  | { ok: false; reason: "emptyPath" | "unknownRoadCell" };

export function validateRoadRemoval(state: GameState, cells: readonly string[]): RoadRemovalValidation {
  if (cells.length === 0) return { ok: false, reason: "emptyPath" };
  const roadCells = allRoadCells(state.roads);
  for (const key of new Set(cells)) {
    if (!roadCells.has(key)) return { ok: false, reason: "unknownRoadCell" };
  }
  return { ok: true };
}
