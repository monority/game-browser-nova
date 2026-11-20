import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import type { GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { isAdjacentToRoad } from "@/domain/network/network.js";
import type { BuildingType } from "@/content/buildings.js";
import { freeCell, mustOk, stockedState, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "build-test", width: 16, height: 16 };

function freshState(): GameState {
  return stockedState(CONFIG);
}

function buildingOf(state: GameState, id: string) {
  const building = state.buildings[id];
  if (!building) throw new Error(`expected building ${id} to exist`);
  return building;
}

describe("building placement", () => {
  it("validation rejects occupied, blocked, out-of-bounds and unaffordable placements", () => {
    const state = freshState();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: spot.x, y: spot.y }));
    expect(applyCommand(state, { kind: "placeBuilding", type: "farm", x: spot.x, y: spot.y })).toEqual({
      ok: false,
      reason: "occupied",
    });
    expect(applyCommand(state, { kind: "placeBuilding", type: "farm", x: -1, y: 0 })).toEqual({
      ok: false,
      reason: "outOfBounds",
    });
    // runtime contract: unknown types are rejected even though the type
    // system narrows Command.kind inputs
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "nope" as BuildingType, x: 1, y: 2 }),
    ).toEqual({
      ok: false,
      reason: "unknownBuildingType",
    });
    // Materials are checked before money (D3): planks for a farm, stone for
    // a warehouse, money only for the civic park.
    state.resources.planks = 0;
    const poor = freeCell(state);
    expect(applyCommand(state, { kind: "placeBuilding", type: "farm", x: poor.x, y: poor.y })).toEqual({
      ok: false,
      reason: "insufficientPlanks",
    });
    state.resources.planks = 200;
    state.resources.stone = 7;
    const stonePoor = freeCell(state);
    expect(applyCommand(state, { kind: "placeBuilding", type: "warehouse", x: stonePoor.x, y: stonePoor.y })).toEqual({
      ok: false,
      reason: "insufficientStone",
    });
    state.resources.stone = 200;
    state.resources.money = 10;
    const moneyPoor = freeCell(state);
    expect(applyCommand(state, { kind: "placeBuilding", type: "park", x: moneyPoor.x, y: moneyPoor.y })).toEqual({
      ok: false,
      reason: "insufficientMoney",
    });
  });

});

describe("construction progress", () => {
  it("buildings become operational after exactly 2 ticks", () => {
    const state = freshState();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: spot.x, y: spot.y }));
    const id = `building-${state.buildingCounter - 1}`;
    stepTicks(state, 1);
    expect(buildingOf(state, id).status).toBe("underConstruction");
    stepTicks(state, 1);
    expect(buildingOf(state, id).status).toBe("operational");
    stepTicks(state, 3);
    expect(buildingOf(state, id).status).toBe("operational");
  });

});

describe("roads", () => {
  it("roads cost 5 per unique cell and dedupe the path", () => {
    const state = freshState();
    stripToAnchor(state);
    const before = state.roadCounter;
    const result = applyCommand(state, {
      kind: "placeRoads",
      cells: [cellKey(0, 0), cellKey(1, 0), cellKey(1, 0)],
    });
    expect(result).toEqual({ ok: true });
    expect(state.resources.money).toBe(100 - 10);
    expect(state.roads[`road-${before}`]?.cells).toEqual([cellKey(0, 0), cellKey(1, 0)]);
  });

  it("roads cannot overlap buildings or terrain", () => {
    const state = freshState();
    stripToAnchor(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 3, y: 3 }));
    expect(applyCommand(state, { kind: "placeRoads", cells: [cellKey(3, 3)] })).toEqual({
      ok: false,
      reason: "occupied",
    });
    expect(applyCommand(state, { kind: "placeRoads", cells: [] })).toEqual({
      ok: false,
      reason: "emptyPath",
    });
  });

});

describe("road access", () => {
  it("building road adjacency is orthogonal only", () => {
    const state = freshState();
    stripToAnchor(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(5, 5)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 6, y: 6 }));
    expect(isAdjacentToRoad(state.roads, 6, 6)).toBe(false);
    expect(isAdjacentToRoad(state.roads, 6, 5)).toBe(true);
  });
});
