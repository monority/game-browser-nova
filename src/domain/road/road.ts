import { parseCellKey } from "../shared/cells.js";
/** Roads persist as cell lists; 5 money per cell (validated contract). */

export interface Road {
  id: string;
  /** Canonical sorted cell keys. */
  cells: string[];
}

export function createRoad(id: string, cells: string[]): Road {
  return { id, cells: [...cells].sort(compare) };
}

export function allRoadCells(roads: Record<string, Road>): Set<string> {
  const occupied = new Set<string>();
  for (const road of Object.values(roads)) {
    for (const key of road.cells) occupied.add(key);
  }
  return occupied;
}

function compare(a: string, b: string): number {
  const pa = parseCellKey(a);
  const pb = parseCellKey(b);
  return pa.y - pb.y || pa.x - pb.x;
}
