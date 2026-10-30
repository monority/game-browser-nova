import type { Road } from "@/domain/road/road.js";
import { parseCellKey } from "@/domain/shared/cells.js";

/**
 * Road access query: orthogonal adjacency between a cell and any road cell.
 * The only road-topology rule the aggregate simulation needs (staffing and
 * commerce are per-building adjacency gates, not per-network effects).
 */
export function isAdjacentToRoad(
  roads: Record<string, Road>,
  x: number,
  y: number,
): boolean {
  for (const road of Object.values(roads)) {
    for (const key of road.cells) {
      const { x: px, y: py } = parseCellKey(key);
      if (Math.abs(px - x) + Math.abs(py - y) === 1) return true;
    }
  }
  return false;
}
