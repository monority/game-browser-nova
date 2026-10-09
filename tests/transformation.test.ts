import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import {
  PLANKS_PER_WORKSHOP_PER_TICK,
  WOOD_PER_PLANK_BATCH,
} from "../src/domain/production/transformation.js";
import { mustOk } from "./helpers.js";

const CONFIG = { seed: "transform-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Staffed, road-connected, operational workshop (1 production tick ready). */
function placeStaffedWorkshop(state: GameState): string {
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(4, 2)] }));
  state.resources.water = Math.max(state.resources.water, 1);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 4, y: 3 }));
  state.population = 1;
  stepTicks(state, 2);
  return "building-1";
}

describe("transformation invariants (Step006)", () => {
  it("constants match the documented recipe", () => {
    expect(WOOD_PER_PLANK_BATCH).toBe(2);
    expect(PLANKS_PER_WORKSHOP_PER_TICK).toBe(1);
  });

  it("normal staffed transformation: −2 wood, +1 plank", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    state.resources.wood = 10;
    const beforeWood = state.resources.wood;
    const beforePlanks = state.resources.planks;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(beforeWood - 2);
    expect(state.resources.planks).toBe(beforePlanks + 1);
  });

  it("unstaffed workshop transforms nothing (but still earns commerce)", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(4, 2)] }));
    state.resources.water = 1;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 4, y: 3 }));
    stepTicks(state, 2);
    state.population = 0; // unstaffs from the next assignment
    state.resources.wood = 10;
    const beforeMoney = state.resources.money;
    const beforeWood = state.resources.wood;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(beforeWood); // no transformation
    // commerce +2, maintenance −1 (workshop is the only operational building)
    expect(state.resources.money).toBe(beforeMoney + 1);
  });

  it("missing input → nothing (all-or-nothing, no partial batch)", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    state.resources.wood = 1; // less than one batch
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(1);
    expect(state.resources.planks).toBe(0);
  });

  it("zero input → nothing", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    stepTicks(state, 1);
    expect(state.resources.planks).toBe(0);
    expect(state.resources.wood).toBe(0);
  });

  it("two staffed workshops consume 4 wood, produce 2 planks", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(8, 6)] }));
    state.resources.water = Math.max(state.resources.water, 1);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 8, y: 7 }));
    stepTicks(state, 2); // both staffed (population 1 fills capacity 1 each? no — pop 1)
    state.population = 2;
    stepTicks(state, 1); // re-assignment with 2 colonists
    state.resources.wood = 20;
    const beforeWood = state.resources.wood;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(beforeWood - 4);
    expect(state.resources.planks).toBe(2);
  });

  it("commerce is unchanged and separate from transformation", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    state.resources.wood = 10;
    const beforeMoney = state.resources.money;
    stepTicks(state, 1);
    // +1 tax (pop 1) +2 commerce −1 maintenance; transformation does not touch money
    expect(state.resources.money).toBe(beforeMoney + 2);
  });
});

describe("quarry plank gate (Step006)", () => {
  it("quarry construction requires 5 planks", () => {
    const state = freshState();
    state.resources.planks = 4;
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "quarry", x: 2, y: 2 }),
    ).toEqual({ ok: false, reason: "insufficientPlanks" });
    state.resources.planks = 5;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "quarry", x: 2, y: 2 }));
    expect(state.resources.planks).toBe(0); // atomic deduction
    expect(state.resources.money).toBe(100 - 25);
  });

  it("other buildings cost no planks", () => {
    const state = freshState();
    state.resources.planks = 2;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 2, y: 2 }));
    expect(state.resources.planks).toBe(2);
  });

  it("plank check is direct stock (never masked by same-tick revenue)", () => {
    const state = freshState();
    state.resources.planks = 0;
    state.resources.money = 1000; // money cannot substitute for planks
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "quarry", x: 2, y: 2 }),
    ).toEqual({ ok: false, reason: "insufficientPlanks" });
  });
});

describe("transformation determinism", () => {
  it("identical states produce identical transformation results", () => {
    const a = freshState();
    const b = freshState();
    for (const s of [a, b]) {
      placeStaffedWorkshop(s);
      s.resources.wood = 7;
      stepTicks(s, 4);
    }
    expect(b).toEqual(a);
  });
});
