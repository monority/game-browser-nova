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

    // The batch is per workshop: 2 wood feeds ONE of two staffed workshops,
    // so a second plank is never minted from wood the colony does not have.
    const paired = freshState();
    stripToAnchor(paired);
    const buildable = (x: number, y: number) =>
      !paired.world.blockedCells[cellKey(x, y)] &&
      !Object.values(paired.buildings).some((b) => b.x === x && b.y === y);
    let lane: { x: number; y: number } | null = null;
    for (let y = 1; y < 15 && !lane; y++) {
      for (let x = 1; x < 13; x++) {
        if ([x, x + 1].every((cx) => buildable(cx, y)) && buildable(x - 1, y) && buildable(x + 2, y)) {
          lane = { x, y };
          break;
        }
      }
    }
    if (!lane) throw new Error("no free road pair");
    mustOk(
      applyCommand(paired, {
        kind: "placeRoads",
        cells: [cellKey(lane.x, lane.y), cellKey(lane.x + 1, lane.y)],
      }),
    );
    paired.resources.water = 5;
    mustOk(applyCommand(paired, { kind: "placeBuilding", type: "workshop", x: lane.x - 1, y: lane.y }));
    mustOk(applyCommand(paired, { kind: "placeBuilding", type: "workshop", x: lane.x + 2, y: lane.y }));
    paired.population = 2;
    stepTicks(paired, 2); // both operational and staffed
    paired.resources.wood = WOOD_PER_PLANK_BATCH; // one batch, two workshops
    const stock = paired.resources.planks;
    stepTicks(paired, 1);
    expect(paired.resources).toMatchObject({ wood: 0, planks: stock + 1 });
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

