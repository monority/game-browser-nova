import type { Road } from "@/domain/road/road.js";
import { allRoadCells } from "@/domain/road/road.js";
import { cellKey } from "@/domain/shared/cells.js";

/**
 * Road access query: orthogonal adjacency between a cell and any road cell.
 * The only road-topology rule the aggregate simulation needs (staffing and
 * commerce are per-building adjacency gates, not per-network effects).
 *
 * Four neighbour lookups against a road-cell set the CALLER has already
 * gathered — the shape every per-tick caller uses, since they ask about every
 * building in a row. The scan this replaces read every road cell and parsed
 * each key, once per building, several times per tick: measured at 32 % of the
 * profile on a 3 000-tick governed run (2026-11-20).
 */
export function isAdjacentToCells(cells: Set<string>, x: number, y: number): boolean {
  return (
    cells.has(cellKey(x - 1, y)) ||
    cells.has(cellKey(x + 1, y)) ||
    cells.has(cellKey(x, y - 1)) ||
    cells.has(cellKey(x, y + 1))
  );
}

/** One-off form: gathers the set itself. Prefer `isAdjacentToCells` in a loop. */
export function isAdjacentToRoad(
  roads: Record<string, Road>,
  x: number,
  y: number,
): boolean {
  return isAdjacentToCells(allRoadCells(roads), x, y);
}
