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
  it("removes a building; the cell becomes placeable again", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.residence }));
    expect(state.buildings[ids.residence]).toBeUndefined();
    // cell reuse: same spot accepts a new building
    const before = state.buildingCounter;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 }));
    expect(state.buildings[`building-${before}`]).toBeDefined();
  });

  it("gives no refund (money untouched by removal)", () => {
    const { state, ids } = settledState();
    const before = state.resources.money;
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.residence }));
    expect(state.resources.money).toBe(before);
  });

  it("stops maintenance at the next economy calculation", () => {
    const { state, ids } = settledState();
    // pop 1, farm staffed; upkeep: farm 1 (residence exempt, Step021)
    const before = state.resources.money;
    stepTicks(state, 1);
    const netBefore = state.resources.money - before; // +1 tax - 1 maint = 0
    expect(netBefore).toBe(0);
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.farm })); // farm
    const m0 = state.resources.money;
    stepTicks(state, 1);
    // residence only (exempt): +1 tax - 0 maintenance = +1
    expect(state.resources.money).toBe(m0 + 1);
  });

  it("recalculates staffing deterministically on the next tick", () => {
    const { state, ids } = settledState();
    // second staffable workplace; pop 1 staffs farm (canonical first)
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(5, 5)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 6, y: 5 }));
    const well = `building-${state.buildingCounter - 1}`;
    stepTicks(state, 3);
    state.population = 2; // farm + well both staffed
    stepTicks(state, 1);
    expect(state.buildings[ids.farm]?.staffed).toBe(true);
    expect(state.buildings[well]?.staffed).toBe(true);
    // remove the farm ? well keeps the colonist, deterministically
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.farm }));
    stepTicks(state, 1);
    expect(state.buildings[ids.farm]).toBeUndefined();
    expect(state.buildings[well]?.staffed).toBe(true);
  });

  it("protects the Colony Center anchor and rejects unknown ids", () => {
    const { state } = settledState();
    expect(
      applyCommand(state, { kind: "removeBuilding", id: "colony-center" }),
    ).toEqual({ ok: false, reason: "anchorProtected" });
    expect(state.buildings["colony-center"]).toBeDefined();
    expect(applyCommand(state, { kind: "removeBuilding", id: "building-99" })).toEqual({
      ok: false, reason: "unknownBuilding",
    });
  });

  it("allows removing an under-construction building (no future maintenance)", () => {
    const { state } = settledState();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    const id = `building-${state.buildingCounter - 1}`;
    expect(state.buildings[id]?.status).toBe("underConstruction");
    mustOk(applyCommand(state, { kind: "removeBuilding", id }));
    stepTicks(state, 3);
    // never became operational ? never paid maintenance
    expect(state.buildings[id]).toBeUndefined();
  });
});

describe("road removal", () => {
  it("removes a road cell; empty roads are deleted; networks shrink", () => {
    const { state } = settledState();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(spot.x, spot.y)] }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(spot.x, spot.y)] }));
    expect(Object.keys(state.roads).length).toBe(1); // road-x for (0,0) remains
    // removed cell accepts a building again
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
  });

  it("partial cell removal splits the remaining road entry", () => {
    const { state } = settledState();
    const a = freeCell(state);
    const b = freeCell(state, new Set([cellKey(a.x, a.y)]));
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(a.x, a.y), cellKey(b.x, b.y)] }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(a.x, a.y)] }));
    const remaining = Object.values(state.roads).flatMap((r) => r.cells);
    expect(remaining).toContain(cellKey(b.x, b.y));
    expect(remaining).not.toContain(cellKey(a.x, a.y));
  });

  it("losing road access unstaffs the workplace", () => {
    const { state, ids } = settledState();
    expect(state.buildings[ids.farm]?.staffed).toBe(true); // farm staffed
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(0, 0)] }));
    stepTicks(state, 1);
    expect(state.buildings[ids.farm]?.staffed).toBe(false);
  });

  it("rejects unknown road cells and empty paths", () => {
    const { state } = settledState();
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
  it("W > F: removal recovers a frozen colony by shedding upkeep permanently", () => {
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

    // frozen: revenue = 1 tax (gate closed below pop 8),
    // upkeep = 4 (farm + well + 2 workshops; residence exempt) -> net -3
    state.resources.money = 0;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(0);

    // removal-driven recovery: shed well + both workshops (capital destroyed,
    // unlike mothballing). Upkeep 1 (farm) -> net = 1 - 1 = 0... not enough:
    // shed the well only after staffing? No - shed well + workshops, keep farm:
    // net = 1 tax - 1 farm = 0. Still frozen! Shed the farm too? Then no food
    // engine... but the trickle feeds pop 1: shed ALL workplaces -> upkeep 0,
    // net +1. Removal is permanent: the trickle becomes the whole economy.
    mustOk(applyCommand(state, { kind: "removeBuilding", id: wellId }));
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ws1 }));
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ws2 }));
    stepTicks(state, 5);
    expect(state.population).toBe(1); // trickle-fed, alive throughout
    // upkeep 1 (farm): net = 1 - 1 = 0 -> stabilized but not accumulating
    expect(state.resources.money).toBe(0);
  });

  it("W = F: removal sheds the drain but the net-0 boundary still holds", () => {
    const { state, ids } = settledState();
    state.resources.money = 0; // the frozen state: 0 money, net <= 0
    stepTicks(state, 1);
    // net = 1 tax + 0 commerce (gate) - 1 upkeep (farm; residence exempt) = 0
    expect(state.resources.money).toBe(0);

    // removal: shed the farm as well -> upkeep 0 -> net +1 accumulates.
    // (Contrast with mothballing, which preserves capital but keeps the
    // building; removal destroys it. Both escape the freeze here.)
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.farm }));
    stepTicks(state, 5);
    expect(state.population).toBeGreaterThanOrEqual(1); // trickle-fed
    expect(state.resources.money).toBe(5); // +1/tick accumulates
  });

  it("removal decisions and outcomes are deterministic", () => {
    const a = settledState();
    const b = settledState();
    for (const f of [a, b]) {
      mustOk(applyCommand(f.state, { kind: "removeBuilding", id: f.ids.residence }));
      stepTicks(f.state, 5);
    }
    expect(b.state).toEqual(a.state);
  });

  it("save v13 round-trips a post-removal state", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "removeBuilding", id: ids.farm }));
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(0, 0)] }));
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(restored.buildings[ids.farm]).toBeUndefined();
  });
});
