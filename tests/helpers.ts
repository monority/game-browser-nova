import { cellKey } from "../src/domain/shared/cells.js";
import type { GameState } from "../src/domain/simulation/state.js";
import { allRoadCells } from "../src/domain/road/road.js";

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
