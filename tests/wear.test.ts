import { describe, expect, it } from "vitest";
import type { GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { saveToString, parseSaveString } from "@/application/persistence/save.js";
import { buildingActivity } from "@/domain/building/activity.js";
import { WEAR_INTERVAL_TICKS, toolReserveTarget } from "@/domain/building/tools.js";
import { cellKey } from "@/domain/shared/cells.js";
import { mustOk, stockedState, stripToAnchor } from "./helpers.js";

/**
 * D7 wear (2026-11-21): every `WEAR_INTERVAL_TICKS` ticks the colony owes one
 * tool per staffed workplace, and the ones it cannot pay for rest that tick.
 * The bill is on the tick number, so there is no per-building counter to save
 * and the penalty is a lost tick, never a fraction of an integer yield.
 */

const CONFIG = {
  seed: "wear-test",
  width: 16,
  height: 16,
  woodDeposits: [{ x: 12, y: 12, amount: 40 }],
  stoneDeposits: [],
};

/** One staffed workplace is enough to read the bill. */
function stateWithFarm(tools: number): { state: GameState; id: string } {
  const state = stockedState(CONFIG);
  stripToAnchor(state);
  // The law ships OFF; these tests are the ones that turn it on.
  state.wearEnabled = true;
  state.resources.tools = tools;
  const road = { x: 4, y: 2 };
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 4, y: 3 }));
  state.population = 1;
  stepTicks(state, 2); // construction, then the assignment at the end of tick 2
  const id = Object.keys(state.buildings).find((key) => state.buildings[key]?.type === "farm");
  if (!id) throw new Error("missing farm");
  return { state, id };
}

describe("the wear bill", () => {
  it("is charged on the interval and rests what it cannot pay", () => {
    const { state, id } = stateWithFarm(0);
    // Bring the colony to the tick before the bill, then cross it.
    stepTicks(state, WEAR_INTERVAL_TICKS - state.tick - 1);
    expect(state.restingWorkplaces[id]).toBeUndefined();

    stepTicks(state, 1);
    expect(state.tick).toBe(WEAR_INTERVAL_TICKS);
    expect(state.restingWorkplaces[id]).toBe(true);
    expect(buildingActivity(state, state.buildings[id]!)).toBe("no_tools");
  });

  it("pays one tool per staffed workplace and then lets it work", () => {
    const { state, id } = stateWithFarm(3);
    stepTicks(state, WEAR_INTERVAL_TICKS - state.tick);

    expect(state.tick).toBe(WEAR_INTERVAL_TICKS);
    expect(state.restingWorkplaces[id]).toBeUndefined();
    expect(state.resources.tools).toBe(2);
    expect(buildingActivity(state, state.buildings[id]!)).toBe("operational");
  });

  it("does not charge for a workplace nobody works in", () => {
    const { state } = stateWithFarm(0);
    state.population = 0;
    stepTicks(state, WEAR_INTERVAL_TICKS - state.tick);
    expect(state.restingWorkplaces).toEqual({});
    expect(state.resources.tools).toBe(0);
  });

  it("clears the rest on the next tick: the bill is not a permanent stop", () => {
    const { state, id } = stateWithFarm(0);
    stepTicks(state, WEAR_INTERVAL_TICKS - state.tick);
    expect(state.restingWorkplaces[id]).toBe(true);
    stepTicks(state, 1);
    expect(state.restingWorkplaces[id]).toBeUndefined();
  });
});

describe("the tool reserve", () => {
  /** A staffed farm (one bill) and a staffed workshop with wood to burn. */
  function colony(): GameState {
    const state = stockedState({ ...CONFIG, woodDeposits: [] });
    stripToAnchor(state);
    state.wearEnabled = true;
    state.resources.wood = 40;
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(4, 2)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 4, y: 3 }));
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(6, 2)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 6, y: 3 }));
    state.population = 3;
    stepTicks(state, 2);
    return state;
  }

  it("fills one bill's worth of tools before it makes planks, then stops", () => {
    const state = colony();
    const toolsBefore = state.resources.tools;
    stepTicks(state, 1);
    expect(state.resources.tools).toBe(toolsBefore + 1);
    // The bill is the number of staffed workplaces (farm + workshop).
    expect(toolReserveTarget(state)).toBe(2);

    stepTicks(state, 3);
    expect(state.resources.tools).toBe(2);
    const planksBefore = state.resources.planks;
    stepTicks(state, 1);
    expect(state.resources.planks).toBeGreaterThan(planksBefore);
    expect(state.resources.tools).toBe(2);
  });

  it("reserves nothing while the wear law is off", () => {
    const state = colony();
    state.wearEnabled = false;
    expect(toolReserveTarget(state)).toBe(0);
    const planksBefore = state.resources.planks;
    stepTicks(state, 1);
    expect(state.resources.planks).toBeGreaterThan(planksBefore);
    expect(state.resources.tools).toBe(0);
  });
});

describe("persistence", () => {
  it("keeps the tool stock and the wear flag across a save", () => {
    const { state } = stateWithFarm(7);
    const loaded = parseSaveString(saveToString(state));
    expect(loaded.resources.tools).toBe(7);
    expect(loaded.wearEnabled).toBe(true);
    // The rest set is derived: a reload must recompute, not inherit.
    expect(loaded.restingWorkplaces).toEqual({});
  });

  it("loads an older save with the law it was played under (wear off)", () => {
    const { state } = stateWithFarm(3);
    const doc = JSON.parse(saveToString(state)) as { wearEnabled?: boolean };
    delete doc.wearEnabled;
    const loaded = parseSaveString(JSON.stringify(doc));
    expect(loaded.wearEnabled).toBe(false);
    expect(loaded.resources.tools).toBe(3);
  });
});
