import { cellKey } from "../src/domain/shared/cells.js";
import type { GameState } from "../src/domain/simulation/state.js";

export function mustOk(result: { ok: boolean; reason?: string }): void {
  if (!result.ok) throw new Error(`command failed: ${result.reason ?? "?"}`);
}

/** First buildable cell scanning y asc / x asc (seed-independent). */
export function freeCell(state: GameState, skip = new Set<string>()): { x: number; y: number } {
  for (let y = 0; y < state.world.height; y++) {
    for (let x = 0; x < state.world.width; x++) {
      const key = cellKey(x, y);
      if (state.world.blockedCells[key] || skip.has(key)) continue;
      return { x, y };
    }
  }
  throw new Error("no free cell");
}
