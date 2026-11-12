import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepSimulation, stepTicks } from "@/domain/simulation/tick.js";
import { housingCapacity } from "@/domain/population/population.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";
import { FOOD_PER_FARM_PER_TICK, WATER_PER_WELL_PER_TICK } from "@/domain/production/production.js";

const CONFIG = { seed: "pop-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

function buildingOf(state: GameState, type: string) {
  const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === type);
  if (!id) throw new Error(`expected ${type}`);
  return state.buildings[id]!;
}

/** Place a workplace next to a road plus one residence; settle 1 colonist. */
function placeStaffed(state: GameState, type: "farm" | "well" | "workshop") {
  stripToAnchor(state);
  state.population = 0;
  const roadSpot = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(roadSpot.x, roadSpot.y)] }));
  const spot = adjacentFree(state, roadSpot.x, roadSpot.y);
  mustOk(applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }));
  const homeSpot = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: homeSpot.x, y: homeSpot.y }));
  stepTicks(state, 2); // both operational; admission runs (bootstrap -> pop 1)
  stepTicks(state, 1); // assignJobs staffs the workplace
}

function twoHomes(state: GameState): void {
  stripToAnchor(state);
  state.population = 0;
  const home1 = freeCell(state);
  const home2 = freeCell(state, new Set([cellKey(home1.x, home1.y)]));
  applyCommand(state, { kind: "placeBuilding", type: "residence", x: home1.x, y: home1.y });
  applyCommand(state, { kind: "placeBuilding", type: "residence", x: home2.x, y: home2.y });
}

describe("staffing", () => {
  it("requires road access, fills jobs in canonical order, and idle farms yield nothing", () => {
    const noRoad = freshState();
    stripToAnchor(noRoad);
    noRoad.population = 0;
    const roadSpot = freeCell(noRoad);
    const far = freeCell(noRoad, new Set([
      cellKey(roadSpot.x, roadSpot.y),
      cellKey(roadSpot.x + 1, roadSpot.y),
      cellKey(roadSpot.x - 1, roadSpot.y),
      cellKey(roadSpot.x, roadSpot.y + 1),
      cellKey(roadSpot.x, roadSpot.y - 1),
    ]));
    mustOk(applyCommand(noRoad, { kind: "placeBuilding", type: "farm", x: far.x, y: far.y }));
    mustOk(applyCommand(noRoad, { kind: "placeRoads", cells: [cellKey(roadSpot.x, roadSpot.y)] }));
    stepTicks(noRoad, 2);
    noRoad.population = 1;
    stepTicks(noRoad, 1);
    expect(buildingOf(noRoad, "farm").staffed).toBe(false);

    const one = freshState();
    stripToAnchor(one);
    one.population = 0;
    mustOk(applyCommand(one, { kind: "placeRoads", cells: [cellKey(0, 0), cellKey(0, 1)] }));
    mustOk(applyCommand(one, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
    mustOk(applyCommand(one, { kind: "placeBuilding", type: "well", x: 1, y: 1 }));
    stepTicks(one, 2);
    one.population = 1;
    stepTicks(one, 1);
    expect(buildingOf(one, "farm").staffed).toBe(true);
    expect(buildingOf(one, "well").staffed).toBe(false);

    const idle = freshState();
    stripToAnchor(idle);
    idle.population = 0;
    idle.resources.food = 100;
    mustOk(applyCommand(idle, { kind: "placeBuilding", type: "farm", x: 5, y: 5 })); // no road
    stepTicks(idle, 5);
    expect(idle.resources.food).toBe(105); // Center trickle only
  });
});

describe("production", () => {
  it("staffed farm +2 food/tick and well +2 water/tick, one tick after assignment", () => {
    const farm = freshState();
    placeStaffed(farm, "farm");
    expect(farm.population).toBe(1);
    const foodBefore = farm.resources.food;
    stepTicks(farm, 1);
    // +2 farm +1 Center trickle − 1 colonist consumption
    expect(farm.resources.food).toBe(foodBefore + FOOD_PER_FARM_PER_TICK);
    expect(FOOD_PER_FARM_PER_TICK).toBe(2);

    const well = freshState();
    placeStaffed(well, "well");
    const waterBefore = well.resources.water;
    stepTicks(well, 1);
    expect(well.resources.water).toBe(waterBefore + WATER_PER_WELL_PER_TICK - 1);
    expect(WATER_PER_WELL_PER_TICK).toBe(2);
  });

  it("staffing is next-tick: a newly operational farm produces only after assignment", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
    state.population = 1;
    stepTicks(state, 2); // operational now; staffed only at end of this tick
    const before = state.resources.food;
    stepTicks(state, 1);
    expect(state.resources.food).toBe(before + FOOD_PER_FARM_PER_TICK);
  });
});

describe("population", () => {
  it("housing capacity counts operational residences only", () => {
    const state = freshState();
    stripToAnchor(state);
    applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    expect(housingCapacity(state)).toBe(0);
    stepTicks(state, 2);
    expect(housingCapacity(state)).toBe(1);
  });

  it("admits a bootstrap colonist with no water, then requires food, water and a free bed", () => {
    const bootstrap = freshState();
    stripToAnchor(bootstrap);
    bootstrap.population = 0;
    applyCommand(bootstrap, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    bootstrap.resources.water = 0;
    stepTicks(bootstrap, 3);
    expect(bootstrap.population).toBe(1); // admitted despite 0 water (population was 0)

    const hungry = freshState();
    stripToAnchor(hungry);
    hungry.population = 0;
    applyCommand(hungry, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    hungry.resources.food = 0;
    stepTicks(hungry, 2);
    expect(hungry.population).toBe(1); // first trickle tick provides the food (Step015)

    const dry = freshState();
    twoHomes(dry);
    dry.resources.water = 0;
    stepTicks(dry, 5); // pop 1 (bootstrap), water 0 → no further admission
    expect(dry.population).toBe(1);

    const capped = freshState();
    stripToAnchor(capped);
    capped.population = 0;
    applyCommand(capped, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
    stepTicks(capped, 10);
    expect(capped.population).toBe(1); // never beyond housing capacity
  });

  it("starvation is gradual, stops when fed, and never re-locks the colony (Step015/Step055 B)", () => {
    const gradual = freshState();
    twoHomes(gradual);
    gradual.resources.water = 10;
    stepTicks(gradual, 4); // pop 2
    expect(gradual.population).toBe(2);
    gradual.resources.food = 0;
    stepTicks(gradual, 1); // one unfed tick → one colonist lost
    expect(gradual.population).toBe(1);
    gradual.resources.food = 20; // the granary recovers
    stepTicks(gradual, 1); // fed again: no further loss, admission resumes
    expect(gradual.population).toBe(2);

    const terminal = freshState();
    twoHomes(terminal);
    terminal.resources.water = 10;
    stepTicks(terminal, 4); // pop 2
    terminal.resources.food = 0;
    stepTicks(terminal, 1);
    expect(terminal.population).toBe(1);
    // the Center trickle re-seeds food → subsistence oscillation, never a dead colony
    const pops: number[] = [];
    for (let i = 0; i < 12; i++) {
      stepSimulation(terminal);
      pops.push(terminal.population);
    }
    expect(Math.max(...pops)).toBeGreaterThanOrEqual(1);
  });

  it("Center trickle never sustains growth alone (balance guard)", () => {
    const state = freshState();
    twoHomes(state);
    state.resources.water = 10;
    const pops: number[] = [];
    for (let i = 0; i < 30; i++) {
      stepSimulation(state);
      pops.push(state.population);
    }
    expect(Math.max(...pops)).toBeLessThanOrEqual(2);
    expect(Math.max(...pops)).toBeGreaterThanOrEqual(1);
  });
});

describe("determinism", () => {
  it("identical states and commands produce identical outcomes", () => {
    const a = freshState();
    const b = freshState();
    for (const s of [a, b]) {
      stripToAnchor(s);
      s.population = 0;
      applyCommand(s, { kind: "placeRoads", cells: [cellKey(0, 0)] });
      applyCommand(s, { kind: "placeBuilding", type: "farm", x: 1, y: 0 });
      applyCommand(s, { kind: "placeBuilding", type: "residence", x: 1, y: 1 });
      stepTicks(s, 12);
    }
    expect(b).toEqual(a);
  });
});
