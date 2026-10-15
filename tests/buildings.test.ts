import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { computeRoadNetworks, isAdjacentToRoad } from "@/domain/network/network.js";
import { BUILDING_DEFINITIONS, type BuildingType } from "@/content/buildings.js";
import { freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "build-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

function buildingOf(state: GameState, id: string) {
  const building = state.buildings[id];
  if (!building) throw new Error(`expected building ${id} to exist`);
  return building;
}

describe("building placement", () => {
  it("residence placement costs 25 money and starts under construction", () => {
    const state = freshState();
    const spot = freeCell(state);
    const result = applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y });
    expect(result).toEqual({ ok: true });
    expect(state.resources.money).toBe(100 - 25);
    const building = buildingOf(state, `building-${state.buildingCounter - 1}`);
    expect(building.status).toBe("underConstruction");
    expect(building.constructionTicksLeft).toBe(2);
  });

  it("ids are deterministic and sequential (D2 colony pre-placed)", () => {
    const state = freshState();
    const start = state.buildingCounter;
    const a = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: a.x, y: a.y }));
    const b = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: b.x, y: b.y }));
    expect(Object.keys(state.buildings).sort()).toContain(`building-${start}`);
    expect(Object.keys(state.buildings).sort()).toContain(`building-${start + 1}`);
    expect(state.buildingCounter).toBe(start + 2);
    // player buildings never inherit the anchor id space
    expect(state.buildings[`building-${start}`]?.id).toBe(`building-${start}`);
  });

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
    state.resources.money = 10;
    const poor = freeCell(state);
    expect(applyCommand(state, { kind: "placeBuilding", type: "farm", x: poor.x, y: poor.y })).toEqual({
      ok: false,
      reason: "insufficientMoney",
    });
  });

  it("workshop placement consumes 1 water and refuses without it", () => {
    const state = freshState();
    const spot = freeCell(state);
    state.resources.water = 0;
    expect(
      applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }),
    ).toEqual({ ok: false, reason: "insufficientWater" });
    state.resources.water = 2;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    expect(state.resources.water).toBe(1);
    expect(state.resources.money).toBe(100 - 25);
  });

  it("catalog values match the documented contract", () => {
    expect(BUILDING_DEFINITIONS.residence).toMatchObject({
      moneyCost: 25,
      constructionTicks: 2,
      jobCapacity: 0,
      housingCapacity: 1,
    });
    expect(BUILDING_DEFINITIONS.farm.jobCapacity).toBe(1);
    expect(BUILDING_DEFINITIONS.well.jobCapacity).toBe(1);
    expect(BUILDING_DEFINITIONS.workshop).toMatchObject({ waterCost: 1, jobCapacity: 1 });
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

  it("construction completion is deterministic", () => {
    const a = freshState();
    const b = freshState();
    const spotA = freeCell(a);
    const spotB = freeCell(b);
    expect(spotA).toEqual(spotB); // same seed, same D2 layout
    mustOk(applyCommand(a, { kind: "placeBuilding", type: "residence", x: spotA.x, y: spotA.y }));
    mustOk(applyCommand(b, { kind: "placeBuilding", type: "residence", x: spotB.x, y: spotB.y }));
    stepTicks(a, 4);
    stepTicks(b, 4);
    expect(b).toEqual(a);
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

  it("road affordability is checked per unique cell", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.money = 12;
    expect(
      applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 1), cellKey(1, 1), cellKey(2, 1)] }),
    ).toEqual({ ok: false, reason: "insufficientMoney" });
  });
});

describe("road networks", () => {
  it("orthogonally connected roads form one network; disjoint roads form two", () => {
    const state = freshState();
    stripToAnchor(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0), cellKey(1, 0), cellKey(2, 0)] }));
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(8, 8), cellKey(8, 9)] }));
    const networks = computeRoadNetworks(state.roads);
    expect(networks.cells.size).toBe(2);
    expect(networks.membership.get(cellKey(0, 0))).toBe(
      networks.membership.get(cellKey(2, 0)),
    );
    expect(networks.membership.get(cellKey(0, 0))).not.toBe(
      networks.membership.get(cellKey(8, 8)),
    );
  });

  it("building road adjacency is orthogonal only", () => {
    const state = freshState();
    stripToAnchor(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(5, 5)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 6, y: 6 }));
    expect(isAdjacentToRoad(state.roads, 6, 6)).toBe(false);
    expect(isAdjacentToRoad(state.roads, 6, 5)).toBe(true);
  });
});
