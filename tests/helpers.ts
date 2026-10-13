import { cellKey } from "../src/domain/shared/cells.js";
import type { GameState } from "../src/domain/simulation/state.js";
import { allRoadCells } from "../src/domain/road/road.js";
import { applyCommand } from "../src/domain/simulation/commands.js";

export function mustOk(result: { ok: boolean; reason?: string }): void {
  if (!result.ok) throw new Error(`command failed: ${result.reason ?? "?"}`);
}

/** First buildable cell (skips terrain, deposits, buildings, roads), scanning y asc / x asc. */
export function freeCell(state: GameState, skip = new Set<string>()): { x: number; y: number } {
  const occupied = allRoadCells(state.roads);
  for (const building of Object.values(state.buildings)) {
    occupied.add(cellKey(building.x, building.y));
  }
  for (const key of Object.keys(state.woodDeposits)) occupied.add(key);
  for (const key of Object.keys(state.stoneDeposits)) occupied.add(key);
  for (let y = 0; y < state.world.height; y++) {
    for (let x = 0; x < state.world.width; x++) {
      const key = cellKey(x, y);
      if (state.world.blockedCells[key] || occupied.has(key) || skip.has(key)) continue;
      return { x, y };
    }
  }
  throw new Error("no free cell");
}

/** Orthogonal neighbors (y/x order irrelevant here). */
export function neighborsOf(x: number, y: number): Array<{ x: number; y: number }> {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}

/** Free orthogonal neighbor of a cell (bounds, terrain, deposits, buildings, roads). */
export function adjacentFree(
  state: GameState,
  x: number,
  y: number,
): { x: number; y: number } {
  const roads = allRoadCells(state.roads);
  const spot = neighborsOf(x, y).find((c) => {
    if (c.x < 0 || c.y < 0 || c.x >= state.world.width || c.y >= state.world.height) return false;
    const key = cellKey(c.x, c.y);
    if (state.world.blockedCells[key] || roads.has(key)) return false;
    if (state.woodDeposits[key] || state.stoneDeposits[key]) return false;
    return !Object.values(state.buildings).some((b) => b.x === c.x && b.y === c.y);
  });
  if (!spot) throw new Error("no adjacent free cell");
  return spot;
}


/**
 * Remove every player building and road, leaving the Colony Center anchor.
 * Lets unit tests isolate a mechanic from the D2 day-0 colony without
 * hiding the product (the strip itself runs through real commands).
 */
export function stripToAnchor(state: GameState): void {
  for (const id of Object.keys(state.buildings)) {
    if (id === "colony-center") continue;
    const result = applyCommand(state, { kind: "removeBuilding", id });
    if (!result.ok) throw new Error("strip failed: " + result.reason);
  }
  for (const road of Object.values(state.roads)) {
    const result = applyCommand(state, { kind: "removeRoads", cells: [...road.cells] });
    if (!result.ok) throw new Error("strip roads failed: " + result.reason);
  }
}
