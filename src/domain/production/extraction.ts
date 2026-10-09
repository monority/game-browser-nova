import type { GameState } from "../simulation/state.js";
import { extractAdjacent } from "../world/deposits.js";
import { addStone, addWood } from "../resource/resource.js";

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

/** Tick phase 4c: wood extraction (staffed camps + unstaffed Colony Center). */
export function produceWood(state: GameState): void {
  const sources: Array<{ x: number; y: number; share: number }> = [];
  for (const building of Object.values(state.buildings)) {
    if (building.status !== "operational") continue;
    if (building.type === "lumberCamp" && building.staffed) {
      sources.push({ x: building.x, y: building.y, share: WOOD_PER_LUMBER_CAMP_PER_TICK });
    }
    if (building.type === "colonyCenter") {
      sources.push({ x: building.x, y: building.y, share: WOOD_PER_COLONY_CENTER_PER_TICK });
    }
  }
  sources.sort((a, b) => a.y - b.y || a.x - b.x);
  const extracted = extractShares(state.woodDeposits, sources);
  addWood(state.resources, extracted);
}

/** Tick phase 4d: stone extraction (staffed quarries only — the anchor collects no stone). */
export function produceStone(state: GameState): void {
  const sources: Array<{ x: number; y: number; share: number }> = [];
  for (const building of Object.values(state.buildings)) {
    if (
      building.type === "quarry" &&
      building.status === "operational" &&
      building.staffed
    ) {
      sources.push({ x: building.x, y: building.y, share: STONE_PER_QUARRY_PER_TICK });
    }
  }
  if (sources.length === 0) return;
  sources.sort((a, b) => a.y - b.y || a.x - b.x);
  const extracted = extractShares(state.stoneDeposits, sources);
  addStone(state.resources, extracted);
}
