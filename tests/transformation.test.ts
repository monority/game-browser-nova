import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  PLANKS_PER_WORKSHOP_PER_TICK,
  WOOD_PER_PLANK_BATCH,
} from "@/domain/production/transformation.js";
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

/** Add a road-connected, funded workshop; returns its id. */
function addWorkshop(state: GameState): string {
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const adj = adjacentFree(state, road.x, road.y);
  state.resources.water = Math.max(state.resources.water, 1);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
  return `building-${state.buildingCounter - 1}`;
}

describe("transformation invariants (Step006)", () => {
  it("follows the documented recipe: −2 wood, +1 plank per staffed workshop", () => {
    expect([WOOD_PER_PLANK_BATCH, PLANKS_PER_WORKSHOP_PER_TICK]).toEqual([2, 1]);
    const state = freshState();
    placeStaffedWorkshop(state);
    state.resources.wood = 10;
    const wood = state.resources.wood;
    const planks = state.resources.planks;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(wood - 2);
    expect(state.resources.planks).toBe(planks + 1);
  });

  it("transforms nothing without a worker or without a full batch (all-or-nothing)", () => {
    const idle = freshState();
    stripToAnchor(idle);
    idle.population = 0; // D2 ships pop 10: zero it before maturation staffing
    const road = freeCell(idle);
    mustOk(applyCommand(idle, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const adj = adjacentFree(idle, road.x, road.y);
    idle.resources.water = 1;
    mustOk(applyCommand(idle, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
    stepTicks(idle, 2);
    expect(idle.population).toBe(0);
    idle.resources.wood = 10;
    const money = idle.resources.money;
    stepTicks(idle, 1);
    expect(idle.resources.wood).toBe(10); // no transformation, no plank bonus
    expect(idle.resources.money).toBe(money - 1); // gate closed: upkeep only
    expect(idle.resources.planks).toBe(0);

    const short = freshState();
    placeStaffedWorkshop(short);
    short.resources.wood = 1;
    stepTicks(short, 1);
    expect(short.resources).toMatchObject({ wood: 1, planks: 0 });

    const empty = freshState();
    placeStaffedWorkshop(empty);
    stepTicks(empty, 1); // wood 0
    expect(empty.resources).toMatchObject({ wood: 0, planks: 0 });
  });

  it("two staffed workshops consume 4 wood for 2 planks", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    addWorkshop(state);
    stepTicks(state, 2);
    state.population = 2;
    stepTicks(state, 1); // re-assignment with 2 colonists
    state.resources.wood = 20;
    stepTicks(state, 1);
    expect(state.resources).toMatchObject({ wood: 16, planks: 2 });
  });

  it("a wood shortfall stops only the workshops it cannot feed (Step039)", () => {
    const state = freshState();
    placeStaffedWorkshop(state);
    addWorkshop(state);
    addWorkshop(state);
    stepTicks(state, 2);
    state.population = 3;
    stepTicks(state, 1); // all three staffed
    expect(
      Object.values(state.buildings).filter((b) => b.type === "workshop" && b.staffed),
    ).toHaveLength(3);
    state.resources.wood = 4;
    const planks = state.resources.planks;
    stepTicks(state, 1);
    expect(state.resources.wood).toBe(0); // two batches consumed
    expect(state.resources.planks).toBe(planks + 2); // not 0, not 3
  });

  it("a vacant connected workshop earns the base floor but no plank bonus (Step012)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.money = 1000;
    state.resources.water = 20;
    // 9 connected workshops, 8 colonists: 8 staffed, 1 vacant by construction
    for (let i = 0; i < 9; i++) addWorkshop(state);
    stepTicks(state, 2);
    state.population = 8;
    stepTicks(state, 1);
    expect(Object.values(state.buildings).filter((b) => b.staffed)).toHaveLength(8);
    state.resources.wood = 100;
    const money = state.resources.money;
    stepTicks(state, 1);
    // 8 staffed transform (8 planks from 16 wood); commerce 9×2 + 8×1 = 26;
    // taxes 8; upkeep 9 → net +25
    expect(state.resources.planks).toBe(8);
    expect(state.resources.money).toBe(money + 25);
  });

  it("commerce is throughput-anchored: base floor plus one per plank produced", () => {
    const withWood = freshState();
    placeStaffedWorkshop(withWood);
    withWood.population = 8; // unlocks the base floor (Step021)
    withWood.resources.wood = 10;
    const m0 = withWood.resources.money;
    stepTicks(withWood, 1);
    // +8 taxes +3 commerce (2 base + 1 plank bonus) −1 upkeep
    expect(withWood.resources.money).toBe(m0 + 10);

    const withoutWood = freshState();
    placeStaffedWorkshop(withoutWood);
    withoutWood.population = 8;
    const m1 = withoutWood.resources.money;
    stepTicks(withoutWood, 1);
    expect(withoutWood.resources.planks).toBe(0);
    expect(withoutWood.resources.money).toBe(m1 + 9); // +8 taxes +2 commerce −1 upkeep
  });
});

describe("quarry plank gate (Step006)", () => {
  it("requires 5 planks in stock, deducts them atomically, and never accepts money instead", () => {
    const state = freshState();
    stripToAnchor(state);
    const spot = freeCell(state);
    state.resources.planks = 4;
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "quarry", x: spot.x, y: spot.y }),
    ).toEqual({ ok: false, reason: "insufficientPlanks" });

    state.resources.planks = 5;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "quarry", x: spot.x, y: spot.y }));
    expect(state.resources.planks).toBe(0);
    expect(state.resources.money).toBe(75);

    const rich = freshState();
    stripToAnchor(rich);
    rich.resources.money = 1000; // money cannot substitute for planks
    const other = freeCell(rich);
    expect(
      applyCommand(rich, { kind: "placeBuilding", type: "quarry", x: other.x, y: other.y }),
    ).toEqual({ ok: false, reason: "insufficientPlanks" });

    const free = freshState();
    stripToAnchor(free);
    free.resources.planks = 2;
    const home = freeCell(free);
    mustOk(applyCommand(free, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
    expect(free.resources.planks).toBe(2); // other buildings cost no planks
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
