import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { cellKey, parseCellKey } from "@/domain/shared/cells.js";
import { orthogonalNeighbors } from "@/domain/shared/cells.js";
import { isActive } from "@/domain/building/building.js";
import { techLevel } from "@/domain/progression/progression.js";

/**
 * Logistics efficiency (Step050, L1-L3 as amended by calibration):
 *
 * An EXTRACTION worksite's output (lumber camp, quarry — the buildings
 * pinned to world-scattered deposits) scales with its ROAD-GRAPH distance
 * to the nearest operational WAREHOUSE. Without any warehouse the colony
 * runs on its founding logistics — everything at 100%.
 *
 * Calibration evidence (Step050 report, two measured collapses): farms,
 * wells and workshops are EXEMPT — an absolute distance tax on subsistance
 * producers breaks the calibrated D2 opening (anchor corner vs colony
 * corner) and the farm-capped growth line (13 farms × penalized yield <
 * population); their logistics land with the V2 network-storage scope.
 *
 * Distance = BFS hops through road cells (topology matters: a cul-de-sac
 * costs). Within the free radius: 100%. Beyond: linear decay per cell
 * down to the floor — a remote producer produces LESS, never zero
 * (01-PRODUCT-VISION §5: proximity is an optimization variable, not a
 * hard requirement). Reductions cannot create dependencies (Step049
 * lesson).
 *
 * Pure and deterministic. Maps are cheap to rebuild (16×16 worlds);
 * callers that consult many buildings build the map once and pass it.
 */

export const LOGISTICS_FREE_RADIUS = 12;
/** Percent lost per network hop beyond the free radius (floor at 60 → 22 hops).
 * Calibrated on the self-play guards (Step050 report): the measured pop-24
 * cluster spans ~15 network hops, so the cadrage's radius-8 constants taxed
 * organic growth into famine; radius 12 / decay 4 / floor 60 keeps edge
 * buildings above 84% while far outposts still feel the pull. */
export const LOGISTICS_DECAY_PER_CELL = 4;
export const LOGISTICS_FLOOR_PERCENT = 60;
/** Wheelbarrow (Step050 L3b): widens the free radius. */
export const WHEELBARROW_FREE_RADIUS_BONUS = 6;

export interface LogisticsMap {
  /** road cellKey → BFS hops to the nearest warehouse road cell; absent = unreachable. */
  distance: Map<string, number>;
}

export function freeLogisticsRadius(state: GameState): number {
  return LOGISTICS_FREE_RADIUS + techLevel(state, "logisticsRadius") * WHEELBARROW_FREE_RADIUS_BONUS;
}

/** Multi-source BFS over the road graph from warehouse-adjacent road cells. */
export function buildLogisticsMap(state: GameState): LogisticsMap {
  const roads = new Set<string>();
  for (const road of Object.values(state.roads)) {
    for (const key of road.cells) roads.add(key);
  }
  const distance = new Map<string, number>();
  let frontier: string[] = [];
  for (const building of Object.values(state.buildings)) {
    if (building.type !== "warehouse" || !isActive(building)) continue;
    for (const n of orthogonalNeighbors(building.x, building.y)) {
      const key = cellKey(n.x, n.y);
      if (roads.has(key) && !distance.has(key)) {
        distance.set(key, 0);
        frontier.push(key);
      }
    }
  }
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const key of frontier) {
      const d = distance.get(key);
      if (d === undefined) continue;
      const { x, y } = parseCellKey(key);
      for (const n of orthogonalNeighbors(x, y)) {
        const nk = cellKey(n.x, n.y);
        if (!roads.has(nk) || distance.has(nk)) continue;
        distance.set(nk, d + 1);
        next.push(nk);
      }
    }
    frontier = next;
  }
  return { distance };
}

/** Network hops from a building to the nearest warehouse; Infinity when
 * the building touches no road that reaches one (or no warehouse exists). */
export function logisticsDistance(
  state: GameState,
  building: Building,
  map: LogisticsMap = buildLogisticsMap(state),
): number {
  let best = Infinity;
  for (const n of orthogonalNeighbors(building.x, building.y)) {
    const d = map.distance.get(cellKey(n.x, n.y));
    if (d !== undefined && d < best) best = d;
  }
  return best;
}

/**
 * Integer percent in [50..100]. 100% when no warehouse exists (founding
 * logistics), within the free radius, or for the hub buildings themselves;
 * linear decay to the floor beyond. Infinity distance (disconnected or
 * roadless) floors — staffing already gates the roadless case.
 */
export function logisticsEfficiencyPercent(
  state: GameState,
  building: Building,
  map: LogisticsMap = buildLogisticsMap(state),
): number {
  const hasWarehouse = Object.values(state.buildings).some(
    (b) => b.type === "warehouse" && isActive(b),
  );
  if (!hasWarehouse) return 100;
  const d = logisticsDistance(state, building, map);
  const radius = freeLogisticsRadius(state);
  if (d <= radius) return 100;
  return Math.max(LOGISTICS_FLOOR_PERCENT, 100 - (d - radius) * LOGISTICS_DECAY_PER_CELL);
}

/** Integer share of a base rate after the logistics penalty. */
export function applyLogistics(
  state: GameState,
  building: Building,
  base: number,
  map: LogisticsMap = buildLogisticsMap(state),
): number {
  return Math.floor((base * logisticsEfficiencyPercent(state, building, map)) / 100);
}
