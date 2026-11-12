import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { parseSave, serialize } from "@/application/persistence/save.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "removal-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Isolated residence + staffed farm by road, matured, pop 1. */
function settledState(): { state: GameState; ids: { residence: string; farm: string } } {
  const state = freshState();
  stripToAnchor(state);
  state.population = 0;
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0)] }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 }));
  const residence = `building-${state.buildingCounter - 1}`;
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
  const farm = `building-${state.buildingCounter - 1}`;
  stepTicks(state, 3); // operational + bootstrap admission
  return { state, ids: { residence, farm } };
}

describe("building removal", () => {
  it("frees the cell for reuse, refunds nothing, and works on unfinished buildings", () => {
    const { state, ids } = settledState();
    const money = state.resources.money;
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.residence }));
    expect(state.buildings[ids.residence]).toBeUndefined();
    expect(state.resources.money).toBe(money);
    const counter = state.buildingCounter;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 }));
    expect(state.buildings[`building-${counter}`]).toBeDefined();

    state.resources.money = 300;
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    const unfinished = `building-${state.buildingCounter - 1}`;
    expect(state.buildings[unfinished]?.status).toBe("underConstruction");
    mustOk(applyCommand(state, { kind: "removeBuilding", id: unfinished }));
    stepTicks(state, 3);
    expect(state.buildings[unfinished]).toBeUndefined(); // never paid upkeep
  });

  it("stops upkeep at the next economy calculation", () => {
    const { state, ids } = settledState();
    // pop 1, farm staffed; upkeep farm 1 (residence exempt, Step021)
    const before = state.resources.money;
    stepTicks(state, 1);
    expect(state.resources.money - before).toBe(0); // +1 tax − 1 upkeep
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.farm }));
    const m0 = state.resources.money;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(m0 + 1); // residence only: +1 tax, no upkeep
  });

  it("recalculates staffing deterministically on the next tick", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(5, 5)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 6, y: 5 }));
    const well = `building-${state.buildingCounter - 1}`;
    stepTicks(state, 3);
    state.population = 2;
    stepTicks(state, 1);
    expect(state.buildings[ids.farm]?.staffed).toBe(true);
    expect(state.buildings[well]?.staffed).toBe(true);
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.farm }));
    stepTicks(state, 1);
    expect(state.buildings[ids.farm]).toBeUndefined();
    expect(state.buildings[well]?.staffed).toBe(true);
  });

  it("protects the Colony Center anchor and rejects unknown ids", () => {
    const { state } = settledState();
    expect(applyCommand(state, { kind: "removeBuilding", id: "colony-center" })).toEqual({
      ok: false,
      reason: "anchorProtected",
    });
    expect(state.buildings["colony-center"]).toBeDefined();
    expect(applyCommand(state, { kind: "removeBuilding", id: "building-99" })).toEqual({
      ok: false,
      reason: "unknownBuilding",
    });
  });
});

describe("road removal", () => {
  it("rewrites networks, splits partial entries, unstaffs and rejects bad requests", () => {
    const { state, ids } = settledState();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(spot.x, spot.y)] }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(spot.x, spot.y)] }));
    expect(Object.keys(state.roads)).toHaveLength(1); // road-x for (0,0) remains
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));

    const a = freeCell(state);
    const b = freeCell(state, new Set([cellKey(a.x, a.y)]));
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(a.x, a.y), cellKey(b.x, b.y)] }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(a.x, a.y)] }));
    const remaining = Object.values(state.roads).flatMap((r) => r.cells);
    expect(remaining).toContain(cellKey(b.x, b.y));
    expect(remaining).not.toContain(cellKey(a.x, a.y));

    expect(state.buildings[ids.farm]?.staffed).toBe(true);
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(0, 0)] }));
    stepTicks(state, 1);
    expect(state.buildings[ids.farm]?.staffed).toBe(false); // losing access unstaffs

    const far = freeCell(state);
    expect(applyCommand(state, { kind: "removeRoads", cells: [cellKey(far.x, far.y)] })).toEqual({
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
  it("removal sheds upkeep permanently: W > F stabilizes, W = F finally accumulates", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.money = 300;
    // farm + well + 2 workshops + residence, each workplace by its own road
    const build = (type: "farm" | "well" | "workshop" | "residence"): string => {
      if (type === "residence") {
        const home = freeCell(state);
        mustOk(applyCommand(state, { kind: "placeBuilding", type, x: home.x, y: home.y }));
      } else {
        const road = freeCell(state);
        mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
        const adj = adjacentFree(state, road.x, road.y);
        mustOk(applyCommand(state, { kind: "placeBuilding", type, x: adj.x, y: adj.y }));
      }
      return `building-${state.buildingCounter - 1}`;
    };
    build("farm");
    const wellId = build("well");
    const ws1 = build("workshop");
    const ws2 = build("workshop");
    build("residence");
    state.resources.water = 4;
    stepTicks(state, 3); // operational, pop 1 admitted
    expect(state.population).toBe(1);

    // frozen: revenue 1 tax (gate closed below pop 8), upkeep 4 (residence exempt)
    state.resources.money = 0;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(0);

    // shedding well + both workshops leaves upkeep 1 (farm): net 0, stabilized
    for (const id of [wellId, ws1, ws2]) {
      mustOk(applyCommand(state, { kind: "removeBuilding", id }));
    }
    stepTicks(state, 5);
    expect(state.population).toBe(1); // trickle-fed, alive throughout
    expect(state.resources.money).toBe(0);

    // W = F: shedding the farm too removes the last upkeep → +1/tick
    const even = settledState();
    even.state.resources.money = 0;
    stepTicks(even.state, 1);
    expect(even.state.resources.money).toBe(0);
    mustOk(applyCommand(even.state, { kind: "removeBuilding", id: even.ids.farm }));
    stepTicks(even.state, 5);
    expect(even.state.population).toBeGreaterThanOrEqual(1);
    expect(even.state.resources.money).toBe(5);
  });

  it("removal is deterministic and its result round-trips through a save", () => {
    const a = settledState();
    const b = settledState();
    for (const f of [a, b]) {
      mustOk(applyCommand(f.state, { kind: "removeBuilding", id: f.ids.residence }));
      stepTicks(f.state, 5);
    }
    expect(b.state).toEqual(a.state);

    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.farm }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(0, 0)] }));
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(restored.buildings[ids.farm]).toBeUndefined();
  });
});
