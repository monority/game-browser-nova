import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import {
  PLANKS_PER_WORKSHOP_PER_TICK,
  WOOD_PER_PLANK_BATCH,
} from "../src/domain/production/transformation.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "transform-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Isolated colony, then a staffed, road-connected, operational workshop. */
function placeStaffedWorkshop(state: GameState): string {
  stripToAnchor(state);
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const adj = adjacentFree(state, road.x, road.y);
  state.resources.water = Math.max(state.resources.water, 1);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
  state.population = 1;
  stepTicks(state, 2);
  const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "workshop");
  if (!id) throw new Error("workshop missing");
  return id;
}

describe("transformation invariants (Step006)", () => {
  it("constants match the documented recipe", () => {
    expect(WOOD_PER_PLANK_BATCH).toBe(2);
    expect(PLANKS_PER_WORKSHOP_PER_TICK).toBe(1);
  });

  it("normal staffed transformation: -2 wood, +1 plank", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    state.resources.wood = 10;
    const beforeWood = state.resources.wood;
    const beforePlanks = state.resources.planks;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(beforeWood - 2);
    expect(state.resources.planks).toBe(beforePlanks + 1);
  });

  it("unstaffed workshop transforms nothing; base commerce needs pop 8 (Step021 gate)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0; // D2 ships pop 10: zero it before maturation staffing
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const adj = adjacentFree(state, road.x, road.y);
    state.resources.water = 1;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
    stepTicks(state, 2);
    expect(state.population).toBe(0); // still unstaffed: no colonists to assign
    state.resources.wood = 10;
    const beforeMoney = state.resources.money;
    const beforeWood = state.resources.wood;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(beforeWood); // no transformation
    // gate closed at pop 0: no commerce, -1 maintenance
    expect(state.resources.money).toBe(beforeMoney - 1);
  });

  it("vacant workshop earns the base once unlocked (Step012, staffing-independent)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.money = 1000;
    state.resources.water = 20;
    // 9 connected workshops, 8 colonists: 8 staffed, 1 vacant by construction
    for (let i = 0; i < 9; i++) {
      const road = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
      const adj = adjacentFree(state, road.x, road.y);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
    }
    stepTicks(state, 2);
    state.population = 8;
    stepTicks(state, 1); // staffing assigns 8 of 9
    const staffed = Object.values(state.buildings).filter((b) => b.staffed).length;
    expect(staffed).toBe(8);
    state.resources.wood = 100;
    const beforeMoney = state.resources.money;
    stepTicks(state, 1);
    // 8 staffed transform (8 planks from 16 wood); commerce 9x2 + 8x1 = 26;
    // taxes 8; maintenance 9 ? net +25
    expect(state.resources.planks).toBe(8);
    expect(state.resources.money).toBe(beforeMoney + 25);
  });

  it("missing input ? nothing (all-or-nothing, no partial batch)", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    state.resources.wood = 1; // less than one batch
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(1);
    expect(state.resources.planks).toBe(0);
  });

  it("zero input ? nothing", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    stepTicks(state, 1);
    expect(state.resources.planks).toBe(0);
    expect(state.resources.wood).toBe(0);
  });

  it("two staffed workshops consume 4 wood, produce 2 planks", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const adj = adjacentFree(state, road.x, road.y);
    state.resources.water = Math.max(state.resources.water, 1);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
    stepTicks(state, 2); // both staffed (population 1 fills capacity 1 each? no � pop 1)
    state.population = 2;
    stepTicks(state, 1); // re-assignment with 2 colonists
    state.resources.wood = 20;
    const beforeWood = state.resources.wood;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(beforeWood - 4);
    expect(state.resources.planks).toBe(2);
  });

  it("commerce is throughput-anchored: staffed workshop with wood earns base + bonus", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    state.population = 8; // unlocks the base floor (Step021)
    state.resources.wood = 10;
    const beforeMoney = state.resources.money;
    stepTicks(state, 1);
    // +8 taxes +3 commerce (2 base + 1 plank bonus) -1 maintenance
    expect(state.resources.money).toBe(beforeMoney + 10);
  });

  it("staffed workshop without wood earns the 2/tick base only", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    state.population = 8; // unlocks the base floor (Step021)
    // wood stays 0 ? no transformation ? no bonus
    const beforeMoney = state.resources.money;
    stepTicks(state, 1);
    expect(state.resources.planks).toBe(0);
    expect(state.resources.money).toBe(beforeMoney + 9); // +8 taxes +2 commerce -1 maint
  });

  it("vacant connected workshop with wood in stock earns no bonus", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0; // D2 ships pop 10: zero it before maturation staffing
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const adj = adjacentFree(state, road.x, road.y);
    state.resources.water = 1;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
    stepTicks(state, 2); // operational, unstaffed (no colonists)
    state.resources.wood = 10; // wood alone is not enough
    const beforeMoney = state.resources.money;
    stepTicks(state, 1);
    expect(state.resources.planks).toBe(0);
    expect(state.resources.money).toBe(beforeMoney - 1); // gate closed: -1 maint
  });
});

describe("quarry plank gate (Step006)", () => {
  it("quarry construction requires 5 planks", () => {
    const state = freshState();
    stripToAnchor(state);
    const spot = freeCell(state);
    state.resources.planks = 4;
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "quarry", x: spot.x, y: spot.y }),
    ).toEqual({ ok: false, reason: "insufficientPlanks" });
    state.resources.planks = 5;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "quarry", x: spot.x, y: spot.y }));
    expect(state.resources.planks).toBe(0); // atomic deduction
    expect(state.resources.money).toBe(100 - 25);
  });

  it("other buildings cost no planks", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.planks = 2;
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    expect(state.resources.planks).toBe(2);
  });

  it("plank check is direct stock (never masked by same-tick revenue)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.money = 1000; // money cannot substitute for planks
    const spot = freeCell(state);
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "quarry", x: spot.x, y: spot.y }),
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
