import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  WOOD_PER_COLONY_CENTER_PER_TICK,
  WOOD_PER_LUMBER_CAMP_PER_TICK,
} from "@/domain/production/extraction.js";
import { normalizeDeposits } from "@/domain/world/deposits.js";
import { mustOk, stripToAnchor } from "./helpers.js";

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
  });

  it("drains multi-deposit cells in lowest canonical key order", () => {
    const state = freshState();
    const id = placeExtractor(state, "lumberCamp", 3, 3); // camp at (4,3)
    state.woodDeposits = {
      [cellKey(4, 2)]: { remaining: 10, capacity: 10 },
      [cellKey(5, 3)]: { remaining: 10, capacity: 10 },
    };
    stepTicks(state, 1);
    expect(state.buildings[id]?.staffed).toBe(true);
    expect(state.woodDeposits[cellKey(4, 2)]?.remaining).toBe(8); // y=2 drains first
    expect(state.woodDeposits[cellKey(5, 3)]?.remaining).toBe(10);
  });

  it("an unstaffed camp extracts nothing, and no deposit means no ex-nihilo wood", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(5, 3)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "lumberCamp", x: 4, y: 3 }));
    state.population = 0;
    stepTicks(state, 6);
    expect(state.resources.wood).toBe(0);
    expect(state.woodDeposits[cellKey(3, 3)]?.remaining).toBe(10);

    const barren = createInitialState({ seed: "no-deposits", width: 12, height: 12 });
    barren.population = 1;
    stepTicks(barren, 5);
    expect(barren.resources.wood).toBe(0);
  });
});

describe("stone extraction (Step005 contract)", () => {
  it("a staffed quarry extracts +2 stone; the Colony Center collects none", () => {
    const state = freshState();
    placeExtractor(state, "quarry", 3, 10);
    stepTicks(state, 1);
    expect(state.resources.stone).toBe(2); // the anchor never collects stone
    expect(state.stoneDeposits[cellKey(3, 10)]?.remaining).toBe(6);

    const anchored = createInitialState({ seed: "lock-test", width: 12, height: 12 });
    const anchor = anchored.buildings["colony-center"];
    if (!anchor) throw new Error("anchor missing");
    anchored.stoneDeposits[cellKey(anchor.x - 1, anchor.y)] = { remaining: 5, capacity: 5 };
    anchored.population = 0;
    stepTicks(anchored, 3);
    expect(anchored.resources.stone).toBe(0);
    expect(anchored.stoneDeposits[cellKey(anchor.x - 1, anchor.y)]?.remaining).toBe(5);
  });
});

describe("Colony Center (Step004 anti-self-lock)", () => {
  it("is pre-placed, operational, unique and placed in the bottom-right-most free corner", () => {
    const state = freshState();
    const anchors = Object.values(state.buildings).filter((b) => b.type === "colonyCenter");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.status).toBe("operational");
    expect(state.buildings["colony-center"]).toBeDefined();
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "colonyCenter", x: 0, y: 0 }),
    ).toEqual({ ok: false, reason: "colonyCenterExists" });

    const anchor = state.buildings["colony-center"];
    if (!anchor) throw new Error("anchor missing");
    expect([anchor.x, anchor.y]).toEqual([19, 19]); // clear corner

    // bottom two rows fully obstructed; bottom of the next row occupied by deposits
    const blockedCells: string[] = [];
    for (let x = 0; x < 20; x++) blockedCells.push(cellKey(x, 19), cellKey(x, 18));
    const blocked = createInitialState({
      ...CONFIG,
      blockedCells,
      woodDeposits: [
        { x: 19, y: 17, amount: 5 },
        { x: 18, y: 17, amount: 5 },
      ],
    });
    const anchor2 = blocked.buildings["colony-center"];
    if (!anchor2) throw new Error("anchor missing");
    const key = cellKey(anchor2.x, anchor2.y);
    expect(blocked.world.blockedCells[key]).toBeUndefined();
    expect(blocked.woodDeposits[key]).toBeUndefined();
    // every cell strictly bottom/right of the anchor is blocked or a deposit
    for (let y = anchor2.y; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (y === anchor2.y && x >= anchor2.x) continue;
        if (y > anchor2.y || x > anchor2.x) {
          const k = cellKey(x, y);
          expect(
            blocked.world.blockedCells[k] !== undefined || blocked.woodDeposits[k] !== undefined,
          ).toBe(true);
        }
      }
    }
  });

  it("extracts 1 wood/tick unstaffed (recovery at pop 0), never ex nihilo, and pays no upkeep", () => {
    const state = createInitialState({ seed: "lock-test", width: 12, height: 12 });
    const anchor = state.buildings["colony-center"];
    if (!anchor) throw new Error("anchor missing");
    state.woodDeposits[cellKey(anchor.x - 1, anchor.y)] = { remaining: 5, capacity: 5 };
    state.population = 0;
    stepTicks(state, 2);
    expect(state.resources.wood).toBe(2 * WOOD_PER_COLONY_CENTER_PER_TICK);
    expect(state.woodDeposits[cellKey(anchor.x - 1, anchor.y)]?.remaining).toBe(3);

    // anchor-only colony: no taxes, no commerce, no upkeep → treasury frozen
    const stripped = freshState();
    stripToAnchor(stripped);
    stripped.population = 0;
    const before = stripped.resources.money;
    stepTicks(stripped, 1);
    expect(stripped.resources.money).toBe(before);

    const exhausted = createInitialState({ seed: "lock-test", width: 12, height: 12 });
    exhausted.population = 0;
    stepTicks(exhausted, 5);
    expect(exhausted.resources.wood).toBe(0);
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

describe("extraction determinism", () => {
  it("identical states and commands produce identical extraction", () => {
    const a = freshState();
    const b = freshState();
    for (const s of [a, b]) {
      placeExtractor(s, "lumberCamp", 3, 3);
      stepTicks(s, 4);
    }
    expect(b).toEqual(a);
  });
});
