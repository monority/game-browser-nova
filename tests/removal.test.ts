import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { stockedState, freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "removal-test", width: 16, height: 16 };

function freshState(): GameState {
  return stockedState(CONFIG);
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

