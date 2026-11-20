import type { GameState } from "@/domain/simulation/state.js";
import { isActive } from "@/domain/building/building.js";
import { techLevel } from "@/domain/progression/progression.js";
import { extractAdjacent } from "@/domain/world/deposits.js";
import { addStone, addWood } from "@/domain/resource/resource.js";
import { cellKey, compareCellCoords, orthogonalNeighbors } from "@/domain/shared/cells.js";
import type { Building } from "@/domain/building/building.js";
import type { Deposits } from "@/domain/world/deposits.js";
import { applyLogistics, buildLogisticsMap } from "@/domain/logistics/logistics.js";

/**
 * Physical extraction (Steps 003/005 contract).
 * Staffed operational extraction buildings drain orthogonally adjacent
 * deposits, capped by what remains (multi-deposit: lowest canonical key
 * first). Same next-tick staffing timing as farms/wells. Extraction
 * decrements the deposits — no ex-nihilo generation.
 */

export const WOOD_PER_LUMBER_CAMP_PER_TICK = 2;
export const STONE_PER_QUARRY_PER_TICK = 2;
/** Primitive unstaffed collection of the Colony Center anchor. */
export const WOOD_PER_COLONY_CENTER_PER_TICK = 1;

/** Quarry yield includes technology (masonry/deepMining: +1 each, Step016). */
export function stonePerQuarry(state: GameState): number {
  return STONE_PER_QUARRY_PER_TICK + techLevel(state, "quarryStone");
}

/**
 * Upper bound of what an extraction building could take next tick: its
 * logistics share of the nominal yield, capped by the deposits it actually
 * reaches. PURE — reads the deposits, writes nothing.
 *
 * The same law the phase applies (`produceWood` / `produceStone`), kept in one
 * place so a reader can ask "could this building produce at all?" without
 * inventing a second rule: the W1 allocation budget funds a workshop with the
 * cut of the camp it just staffed, and the inspector names a worksite with an
 * empty gisement as short of input. Two worksites on the same deposit can both
 * see the full remainder — a high bound, never a free credit: the phase still
 * consumes only what exists.
 */
export function projectedExtraction(
  state: GameState,
  building: Building,
  deposits: Deposits,
  nominal: number,
  map: ReturnType<typeof buildLogisticsMap>,
): number {
  const share = applyLogistics(state, building, nominal, map);
  if (share <= 0) return 0;
  let adjacent = 0;
  for (const neighbour of orthogonalNeighbors(building.x, building.y)) {
    adjacent += deposits[cellKey(neighbour.x, neighbour.y)]?.remaining ?? 0;
  }
  return Math.min(share, adjacent);
}

function extractShares(
  deposits: GameState["woodDeposits"],
  sources: Array<{ x: number; y: number; share: number }>,
): number {
  let taken = 0;
  for (const { x, y, share } of sources) {
    taken += extractAdjacent(deposits, x, y, share);
  }
  return taken;
}

/** Tick phase 3: wood extraction (staffed camps + unstaffed Colony Center,
 * each camp scaled by its logistics efficiency — Step050). */
export function produceWood(state: GameState): void {
  const map = buildLogisticsMap(state);
  const sources: Array<{ x: number; y: number; share: number }> = [];
  for (const building of Object.values(state.buildings)) {
    if (!isActive(building)) continue;
    if (building.type === "lumberCamp" && building.staffed) {
      sources.push({
        x: building.x,
        y: building.y,
        share: applyLogistics(state, building, WOOD_PER_LUMBER_CAMP_PER_TICK, map),
      });
    }
    if (building.type === "colonyCenter") {
      sources.push({ x: building.x, y: building.y, share: WOOD_PER_COLONY_CENTER_PER_TICK });
    }
  }
  sources.sort(compareCellCoords);
  const extracted = extractShares(state.woodDeposits, sources);
  addWood(state.resources, extracted);
}

/** Tick phase 3: stone extraction (staffed quarries only — the anchor
 * collects no stone; each quarry scaled by its logistics efficiency). */
export function produceStone(state: GameState): void {
  const map = buildLogisticsMap(state);
  const sources: Array<{ x: number; y: number; share: number }> = [];
  for (const building of Object.values(state.buildings)) {
    if (
      building.type === "quarry" &&
      isActive(building) &&
      building.staffed
    ) {
      sources.push({
        x: building.x,
        y: building.y,
        share: applyLogistics(state, building, stonePerQuarry(state), map),
      });
    }
  }
  if (sources.length === 0) return;
  sources.sort(compareCellCoords);
  const extracted = extractShares(state.stoneDeposits, sources);
  addStone(state.resources, extracted);
}
