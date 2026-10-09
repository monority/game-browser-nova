import { cellKey, parseCellKey } from "../shared/cells.js";
import type { Road } from "../road/road.js";

/**
 * Road networks: orthogonal connected components of road cells.
 * Pure topology — membership feeds staffing access and commerce queries.
 */

export type NetworkId = string;

export interface RoadNetworks {
  /** cellKey → network id for every road cell. */
  membership: Map<string, NetworkId>;
  /** network id → road cell keys, canonical sorted order. */
  cells: Map<NetworkId, string[]>;
}

export function computeRoadNetworks(roads: Record<string, Road>): RoadNetworks {
  const adjacency = collectRoadAdjacency(roads);
  const membership = new Map<string, NetworkId>();
  const cells = new Map<NetworkId, string[]>();
  const visited = new Set<string>();

  // Deterministic component discovery: sorted root keys.
  const roots = [...adjacency.keys()].sort(compareCellKeys);
  for (const root of roots) {
    if (visited.has(root)) continue;
    const networkId = root; // a network is named by its canonical minimal cell
    const component = floodFill(root, adjacency, visited);
    component.sort(compareCellKeys);
    for (const key of component) membership.set(key, networkId);
    cells.set(networkId, component);
  }

  return { membership, cells };
}

/** True when the given cell is orthogonally adjacent to any road cell. */
export function isAdjacentToRoad(
  roads: Record<string, Road>,
  x: number,
  y: number,
): boolean {
  for (const road of Object.values(roads)) {
    for (const key of road.cells) {
      const px = Number(key.slice(0, key.indexOf(",")));
      const py = Number(key.slice(key.indexOf(",") + 1));
      if (Math.abs(px - x) + Math.abs(py - y) === 1) return true;
    }
  }
  return false;
}

function collectRoadAdjacency(roads: Record<string, Road>): Map<string, string[]> {
  const cells = new Set<string>();
  for (const road of Object.values(roads)) {
    for (const key of road.cells) cells.add(key);
  }
  const adjacency = new Map<string, string[]>();
  for (const key of cells) {
    const { x, y } = parseKey(key);
    const neighbors: string[] = [];
    const neighborOffsets: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighborOffsets) {
      const nKey = cellKey(nx, ny);
      if (cells.has(nKey)) neighbors.push(nKey);
    }
    adjacency.set(key, neighbors);
  }
  return adjacency;
}

function floodFill(
  root: string,
  adjacency: Map<string, string[]>,
  visited: Set<string>,
): string[] {
  const component: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (visited.has(current)) continue;
    visited.add(current);
    component.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }
  return component;
}

function parseKey(key: string): { x: number; y: number } {
  return parseCellKey(key);
}

function compareCellKeys(a: string, b: string): number {
  const pa = parseKey(a);
  const pb = parseKey(b);
  return pa.y - pb.y || pa.x - pb.x;
}
