import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { WOOD_PER_LUMBER_CAMP_PER_TICK } from "@/domain/production/extraction.js";
import { normalizeDeposits } from "@/domain/world/deposits.js";
import { mustOk, neighborsOf, stripToAnchor } from "./helpers.js";

/**
 * Tick timeline (verified): a 2-tick building placed before stepTicks(2)
 * becomes operational during tick 2 and is staffed at the END of tick 2 —
 * so stepTicks(2) + stepTicks(1) = exactly ONE production tick.
 */

const CONFIG = {
  seed: "extract-test",
  width: 20,
  height: 20,
  woodDeposits: [{ x: 3, y: 3, amount: 10 }],
  stoneDeposits: [{ x: 3, y: 10, amount: 8 }],
};

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Staffed extraction building adjacent to a given deposit cell; 1 production tick ready. */
function placeExtractor(
  state: GameState,
  type: "lumberCamp" | "quarry",
  depositX: number,
  depositY: number,
): string {
  stripToAnchor(state); // isolate: D2 workplaces would steal staffing
  state.population = 0;
  const candidates = [
    { x: depositX + 1, y: depositY },
    { x: depositX - 1, y: depositY },
    { x: depositX, y: depositY + 1 },
    { x: depositX, y: depositY - 1 },
  ];
  const spot = candidates.find((c) => !state.world.blockedCells[cellKey(c.x, c.y)]);
  if (!spot) throw new Error("no buildable cell adjacent to deposit");
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(spot.x + 1, spot.y)] }));
  if (type === "quarry") state.resources.planks = Math.max(state.resources.planks, 5);
  mustOk(applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }));
  state.population = 1; // staffs the workplace at end of tick 2
  stepTicks(state, 2);
  const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === type);
  if (!id) throw new Error("extractor missing");
  return id;
}

describe("wood extraction (Step003 contract)", () => {
  it("a staffed camp extracts +2 and drains the deposit, capped at the remaining stock", () => {
    const state = freshState();
    const id = placeExtractor(state, "lumberCamp", 3, 3);
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(WOOD_PER_LUMBER_CAMP_PER_TICK);
    expect(state.woodDeposits[cellKey(3, 3)]?.remaining).toBe(8);
    expect(state.buildings[id]?.staffed).toBe(true);

    state.woodDeposits[cellKey(3, 3)] = { remaining: 3, capacity: 10 };
    stepTicks(state, 2); // demand 4 > remaining 3 (anchor not adjacent)
    expect(state.woodDeposits[cellKey(3, 3)]?.remaining).toBe(0);
    expect(state.woodDeposits[cellKey(3, 3)]).toBeDefined(); // entry persists

    // The anchor's primitive trickle is 1/tick on a deposit it touches —
    // double it and the post-famine recovery floor is silently inflated.
    const anchorOnly = freshState();
    stripToAnchor(anchorOnly);
    anchorOnly.population = 0;
    const anchor = Object.values(anchorOnly.buildings).find((b) => b.type === "colonyCenter");
    if (!anchor) throw new Error("anchor missing");
    const near = neighborsOf(anchor.x, anchor.y).find(
      (c) => !anchorOnly.world.blockedCells[cellKey(c.x, c.y)],
    );
    if (!near) throw new Error("no cell next to the anchor");
    anchorOnly.woodDeposits[cellKey(near.x, near.y)] = { remaining: 10, capacity: 10 };
    const wood = anchorOnly.resources.wood;
    stepTicks(anchorOnly, 1);
    expect(anchorOnly.resources.wood).toBe(wood + 1); // one trickle, not two
    expect(anchorOnly.woodDeposits[cellKey(near.x, near.y)]?.remaining).toBe(9);
  });

});



describe("deposit placement protection", () => {
  it("refuses buildings on deposits and normalizes + dedupes deposit seeds", () => {
    const base = createInitialState({ seed: "protect-test", width: 16, height: 16 });
    const free = (skip: Set<string>) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const key = cellKey(x, y);
          if (!base.world.blockedCells[key] && !skip.has(key)) return { x, y };
        }
      }
      throw new Error("no free cell");
    };
    const c1 = free(new Set());
    const c2 = free(new Set([cellKey(c1.x, c1.y)]));
    const state = createInitialState({
      seed: "protect-test",
      width: 16,
      height: 16,
      woodDeposits: [{ x: c1.x, y: c1.y, amount: 5 }],
      stoneDeposits: [{ x: c2.x, y: c2.y, amount: 5 }],
    });
    for (const cell of [c1, c2]) {
      expect(applyCommand(state, { kind: "placeBuilding", type: "farm", x: cell.x, y: cell.y }))
        .toEqual({ ok: false, reason: "depositBlocked" });
    }

    const deposits = normalizeDeposits([
      { x: 1, y: 1, amount: 5 },
      { x: 1, y: 1, amount: 5 },
      { x: 2, y: 2, amount: 3 },
    ]);
    expect(Object.keys(deposits)).toHaveLength(2);
    expect(deposits[cellKey(1, 1)]?.remaining).toBe(10);
  });
});

