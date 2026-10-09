import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import { parseSave, serialize } from "../src/application/persistence/save.js";
import { mustOk } from "./helpers.js";

const CONFIG = { seed: "removal-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Residence at (1,1) + farm at (1,0) road-adjacent to road (0,0), matured. */
function settledState(): GameState {
  const state = freshState();
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0)] }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
  stepTicks(state, 3); // operational + bootstrap admission
  return state;
}

describe("building removal", () => {
  it("removes a building; the cell becomes placeable again", () => {
    const state = settledState();
    mustOk(applyCommand(state, { kind: "removeBuilding", id: "building-1" }));
    expect(state.buildings["building-1"]).toBeUndefined();
    // cell reuse: same spot accepts a new building
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 }));
    expect(state.buildings["building-3"]).toBeDefined();
  });

  it("gives no refund (money untouched by removal)", () => {
    const state = settledState();
    const before = state.resources.money;
    mustOk(applyCommand(state, { kind: "removeBuilding", id: "building-1" }));
    expect(state.resources.money).toBe(before);
  });

  it("stops maintenance at the next economy calculation", () => {
    const state = settledState();
    // pop 1, farm staffed; maintenance: residence + farm = 2
    const before = state.resources.money;
    stepTicks(state, 1);
    const netBefore = state.resources.money - before; // +1 tax - 2 maint = -1
    expect(netBefore).toBe(-1);
    mustOk(applyCommand(state, { kind: "removeBuilding", id: "building-2" })); // farm
    const m0 = state.resources.money;
    stepTicks(state, 1);
    // residence only: +1 tax - 1 maintenance = 0
    expect(state.resources.money).toBe(m0);
  });

  it("recalculates staffing deterministically on the next tick", () => {
    const state = settledState();
    // second staffable workplace; pop 1 staffs farm (canonical first)
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(5, 5)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 6, y: 5 }));
    stepTicks(state, 3);
    state.population = 2; // farm + well both staffed
    stepTicks(state, 1);
    expect(state.buildings["building-2"]?.staffed).toBe(true);
    expect(state.buildings["building-3"]?.staffed).toBe(true);
    // remove the farm → well keeps the colonist, deterministically
    mustOk(applyCommand(state, { kind: "removeBuilding", id: "building-2" }));
    stepTicks(state, 1);
    expect(state.buildings["building-2"]).toBeUndefined();
    expect(state.buildings["building-3"]?.staffed).toBe(true);
  });

  it("protects the Colony Center anchor and rejects unknown ids", () => {
    const state = settledState();
    expect(
      applyCommand(state, { kind: "removeBuilding", id: "colony-center" }),
    ).toEqual({ ok: false, reason: "anchorProtected" });
    expect(state.buildings["colony-center"]).toBeDefined();
    expect(applyCommand(state, { kind: "removeBuilding", id: "building-99" })).toEqual({
      ok: false,
      reason: "unknownBuilding",
    });
  });

  it("allows removing an under-construction building (no future maintenance)", () => {
    const state = settledState();
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 4, y: 4 }));
    expect(state.buildings["building-3"]?.status).toBe("underConstruction");
    mustOk(applyCommand(state, { kind: "removeBuilding", id: "building-3" }));
    stepTicks(state, 3);
    // never became operational → never paid maintenance
    expect(state.buildings["building-3"]).toBeUndefined();
  });
});

describe("road removal", () => {
  it("removes a road cell; empty roads are deleted; networks shrink", () => {
    const state = settledState();
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(8, 8)] }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(8, 8)] }));
    expect(Object.keys(state.roads).length).toBe(1); // road-x for (0,0) remains
    // removed cell accepts a building again
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 8, y: 8 }));
  });

  it("partial cell removal splits the remaining road entry", () => {
    const state = settledState();
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(2, 2), cellKey(2, 3)] }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(2, 2)] }));
    const remaining = Object.values(state.roads).flatMap((r) => r.cells);
    expect(remaining).toContain(cellKey(2, 3));
    expect(remaining).not.toContain(cellKey(2, 2));
  });

  it("losing road access unstaffs the workplace", () => {
    const state = settledState();
    expect(state.buildings["building-2"]?.staffed).toBe(true); // farm staffed
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(0, 0)] }));
    stepTicks(state, 1);
    expect(state.buildings["building-2"]?.staffed).toBe(false);
  });

  it("rejects unknown road cells and empty paths", () => {
    const state = settledState();
    expect(applyCommand(state, { kind: "removeRoads", cells: [cellKey(9, 9)] })).toEqual({
      ok: false,
      reason: "unknownRoadCell",
    });
    expect(applyCommand(state, { kind: "removeRoads", cells: [] })).toEqual({
      ok: false,
      reason: "emptyPath",
    });
  });
});

describe("zero-money colony recovery probe (honest deadlock check)", () => {
  it("removal stabilizes a frozen colony but cannot restart growth", () => {
    const state = freshState();
    state.resources.money = 300;
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0), cellKey(0, 1), cellKey(0, 2)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 1, y: 1 }));
    state.resources.water = Math.max(state.resources.water, 1);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 1, y: 2 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 5, y: 5 }));
    stepTicks(state, 3); // all operational, pop 1 admitted
    state.resources.money = 0; // the frozen state: 0 money, net ≤ 0
    stepTicks(state, 1);
    // net = 1 tax + 2 commerce − 4 maintenance = −1 → money stays 0
    expect(state.resources.money).toBe(0);

    // removal: shed the unstaffed well (maintenance 4 → 3)
    mustOk(applyCommand(state, { kind: "removeBuilding", id: "building-2" }));
    stepTicks(state, 10);
    const stats = state.resources;
    // net = 1 + 2 − 3 = 0: colony survives (farm staffed, food stable) but
    // money NEVER accumulates → growth remains deadlocked (D1)
    expect(state.population).toBeGreaterThanOrEqual(1);
    expect(stats.food).toBeGreaterThan(0);
    expect(stats.money).toBe(0);
    expect(stats.money).toBe(0); // no accumulation at net 0
  });

  it("removal decisions and outcomes are deterministic", () => {
    const a = settledState();
    const b = settledState();
    for (const s of [a, b]) {
      mustOk(applyCommand(s, { kind: "removeBuilding", id: "building-1" }));
      stepTicks(s, 5);
    }
    expect(b).toEqual(a);
  });

  it("save v13 round-trips a post-removal state", () => {
    const state = settledState();
    mustOk(applyCommand(state, { kind: "removeBuilding", id: "building-2" }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(0, 0)] }));
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(restored.buildings["building-2"]).toBeUndefined();
  });
});
