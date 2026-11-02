import type { GameState } from "@/domain/simulation/state.js";
import { isActive } from "@/domain/building/building.js";
import { techLevel } from "@/domain/progression/progression.js";
import { extractAdjacent } from "@/domain/world/deposits.js";
import { addStone, addWood } from "@/domain/resource/resource.js";
import { compareCellCoords } from "@/domain/shared/cells.js";
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
