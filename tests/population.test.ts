import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepSimulation, stepTicks } from "@/domain/simulation/tick.js";
import { housingCapacity, updatePopulation } from "@/domain/population/population.js";
import { freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "pop-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

function buildingOf(state: GameState, type: string) {
  const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === type);
  if (!id) throw new Error(`expected ${type}`);
  return state.buildings[id]!;
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
    idle.resources.food = 10;
    mustOk(applyCommand(idle, { kind: "placeBuilding", type: "farm", x: 5, y: 5 })); // no road
    // Step067: an idle farm must add nothing, whatever conservation does to
    // the granary — so the claim is measured against the same colony without
    // the farm rather than against a hand-added trickle total.
    const idleTwin = freshState();
    stripToAnchor(idleTwin);
    idleTwin.population = 0;
    idleTwin.resources.food = 10;
    stepTicks(idle, 5);
    stepTicks(idleTwin, 5);
    expect(idle.resources.food).toBe(idleTwin.resources.food); // Center trickle only
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

  it("admits at exact water balance and refuses one colonist short (Step077)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    const used = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const spot = freeCell(state, new Set(used));
      used.add(cellKey(spot.x, spot.y));
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 2); // the residences finish building
    expect(housingCapacity(state)).toBe(4);

    state.population = 2;
    state.resources.food = 20;
    // served === population with an empty stock: the old rule (stock > 0)
    // froze growth here for good. Growth must resume.
    updatePopulation(state, 2, 2);
    expect(state.population).toBe(3);
    // one colonist unserved: coverage below 100 %, admission suspended.
    updatePopulation(state, 3, 2);
    expect(state.population).toBe(3);
  });

});

