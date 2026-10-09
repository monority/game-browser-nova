import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import { housingCapacity, availableJobs } from "../src/domain/population/population.js";
import { freeCell, mustOk } from "./helpers.js";
import {
  FOOD_PER_FARM_PER_TICK,
  WATER_PER_WELL_PER_TICK,
} from "../src/domain/production/production.js";

const CONFIG = { seed: "pop-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

function buildingOf(state: GameState, id: string) {
  const building = state.buildings[id];
  if (!building) throw new Error(`expected building ${id}`);
  return building;
}

function mustOkLocal(result: { ok: boolean; reason?: string }): void {
  mustOk(result);
}

/** Place a workplace next to a road plus one residence; settle 1 colonist. */
function placeStaffed(state: GameState, type: "farm" | "well" | "workshop") {
  const roadSpot = freeCell(state);
  mustOkLocal(applyCommand(state, { kind: "placeRoads", cells: [cellKey(roadSpot.x, roadSpot.y)] }));
  // ensure the workplace is orthogonally adjacent to the road
  const candidates = [
    { x: roadSpot.x + 1, y: roadSpot.y },
    { x: roadSpot.x - 1, y: roadSpot.y },
    { x: roadSpot.x, y: roadSpot.y + 1 },
    { x: roadSpot.x, y: roadSpot.y - 1 },
  ];
  const spot = candidates.find(
    (c) =>
      c.x >= 0 && c.y >= 0 && c.x < state.world.width && c.y < state.world.height &&
      !state.world.blockedCells[cellKey(c.x, c.y)],
  );
  if (!spot) throw new Error("no adjacent free cell");
  mustOkLocal(applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }));
  const homeSpot = freeCell(state, new Set([cellKey(roadSpot.x, roadSpot.y), cellKey(spot.x, spot.y)]));
  mustOkLocal(applyCommand(state, { kind: "placeBuilding", type: "residence", x: homeSpot.x, y: homeSpot.y }));
  stepTicks(state, 2); // both operational; admission runs (bootstrap → pop 1)
  stepTicks(state, 1); // assignJobs staffs the workplace
}

describe("staffing", () => {
  it("requires road access and an operational building", () => {
    const state = freshState();
    // farm far from any road (use a cell at least 2 away from the road we add)
    const roadSpot = freeCell(state);
    const farmSpot = freeCell(state, new Set([
      cellKey(roadSpot.x, roadSpot.y),
      cellKey(roadSpot.x + 1, roadSpot.y),
      cellKey(roadSpot.x - 1, roadSpot.y),
      cellKey(roadSpot.x, roadSpot.y + 1),
      cellKey(roadSpot.x, roadSpot.y - 1),
    ]));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: farmSpot.x, y: farmSpot.y }));
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(roadSpot.x, roadSpot.y)] }));
    stepTicks(state, 2);
    state.population = 1;
    stepTicks(state, 1);
    expect(buildingOf(state, "building-1").staffed).toBe(false);
  });

  it("capacity 1: two workplaces, one colonist → first canonically staffed", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0), cellKey(0, 1)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 1, y: 1 }));
    stepTicks(state, 2);
    state.population = 1;
    stepTicks(state, 1);
    expect(buildingOf(state, "building-1").staffed).toBe(true);
    expect(buildingOf(state, "building-2").staffed).toBe(false);
    expect(availableJobs(state)).toBe(2);
  });

  it("unstaffed farms produce nothing", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 5, y: 5 })); // no road
    stepTicks(state, 5);
    expect(state.resources.food).toBe(100); // untouched
  });
});

describe("production", () => {
  it("staffed farm produces +2 food/tick (net +1 with 1 colonist eating)", () => {
    const state = freshState();
    placeStaffed(state, "farm");
    expect(state.population).toBe(1);
    const before = state.resources.food;
    stepTicks(state, 1);
    // +2 production − 1 colonist consumption
    expect(state.resources.food).toBe(before + FOOD_PER_FARM_PER_TICK - 1);
    expect(FOOD_PER_FARM_PER_TICK).toBe(2);
  });

  it("staffed well produces +2 water/tick (net +1 with 1 colonist served)", () => {
    const state = freshState();
    placeStaffed(state, "well");
    expect(state.population).toBe(1);
    const before = state.resources.water;
    stepTicks(state, 1);
    // +2 production − 1 served colonist
    expect(state.resources.water).toBe(before + WATER_PER_WELL_PER_TICK - 1);
    expect(WATER_PER_WELL_PER_TICK).toBe(2);
  });

  it("staffing is next-tick: a newly operational farm produces only after assignment", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
    state.population = 1;
    stepTicks(state, 2); // operational now; staffed only at end of this tick
    const before = state.resources.food;
    stepTicks(state, 1); // first producing tick
    expect(state.resources.food).toBe(before + FOOD_PER_FARM_PER_TICK - 1);
  });
});

describe("population", () => {
  it("housing capacity counts operational residences only", () => {
    const state = freshState();
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    expect(housingCapacity(state)).toBe(0);
    stepTicks(state, 2);
    expect(housingCapacity(state)).toBe(1);
  });

  it("admission: first colonist is bootstrap-exempt from the water gate", () => {
    const state = freshState();
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    state.resources.water = 0;
    stepTicks(state, 3);
    expect(state.population).toBe(1); // admitted despite 0 water (population was 0)
  });

  it("admission requires food; without food nobody is admitted", () => {
    const state = freshState();
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    state.resources.food = 0;
    stepTicks(state, 5);
    expect(state.population).toBe(0);
  });

  it("admission beyond housing capacity is impossible", () => {
    const state = freshState();
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    stepTicks(state, 10);
    expect(state.population).toBe(1);
  });

  it("admission with population > 0 requires water headroom", () => {
    const state = freshState();
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 2, y: 1 });
    stepTicks(state, 5); // pop 1 (bootstrap), water 0 → no further admission
    expect(state.population).toBe(1);
  });

  it("starvation is all-or-nothing: unfed tick removes the entire population", () => {
    const state = freshState();
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    stepTicks(state, 3);
    expect(state.population).toBe(1);
    state.resources.food = 0;
    stepTicks(state, 1);
    expect(state.population).toBe(0);
  });

  it("population-0 + food-0 colony re-admits once food returns (recovery)", () => {
    const state = freshState();
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    stepTicks(state, 3);
    state.population = 0;
    state.resources.food = 0;
    state.resources.food = 50;
    stepTicks(state, 1);
    expect(state.population).toBe(1);
  });
});

describe("determinism", () => {
  it("identical states and commands produce identical outcomes", () => {
    const a = freshState();
    const b = freshState();
    for (const s of [a, b]) {
      applyCommand(s, { kind: "placeRoads", cells: [cellKey(0, 0)] });
      applyCommand(s, { kind: "placeBuilding", type: "farm", x: 1, y: 0 });
      applyCommand(s, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
      stepTicks(s, 12);
    }
    expect(b).toEqual(a);
  });
});
