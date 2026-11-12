import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { housingCapacity } from "@/domain/population/population.js";
import {
  parseSave,
  serialize,
  MIGRATABLE_SAVE_VERSION,
  SaveValidationError,
} from "@/application/persistence/save.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";
import { allRoadCells } from "@/domain/road/road.js";

const CONFIG = { seed: "deactivate-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** First free vertical 3-cell strip with a free adjacent column, deterministically. */
function findStrip(state: GameState, skip: Set<string>): { x: number; y: number; side: number } {
  const taken = new Set<string>(skip);
  for (const building of Object.values(state.buildings)) taken.add(cellKey(building.x, building.y));
  for (const cell of allRoadCells(state.roads)) taken.add(cell);
  for (const key of Object.keys(state.woodDeposits)) taken.add(key);
  for (const key of Object.keys(state.stoneDeposits)) taken.add(key);
  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < state.world.width && y < state.world.height &&
    !state.world.blockedCells[cellKey(x, y)] && !taken.has(cellKey(x, y));
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 16; x++) {
      for (const side of [1, -1] as const) {
        if (
          free(x, y) && free(x, y + 1) && free(x, y + 2) &&
          free(x + side, y) && free(x + side, y + 1) && free(x + side, y + 2)
        ) {
          return { x, y, side };
        }
      }
    }
  }
  throw new Error("no free strip");
}

function stripCells(strip: { x: number; y: number; side: number }): string[] {
  return [0, 1, 2].flatMap((dy) => [
    cellKey(strip.x, strip.y + dy),
    cellKey(strip.x + strip.side, strip.y + dy),
  ]);
}

/**
 * Standard fixture: road strip, farm + well + workshop adjacent (in that
 * canonical staffing order), one residence elsewhere. Matured; pop 1 staffs
 * the farm.
 */
function settledState(): {
  state: GameState;
  ids: { farm: string; well: string; workshop: string; residence: string };
} {
  const state = freshState();
  stripToAnchor(state);
  state.population = 0;
  state.resources.money = 300;
  state.resources.water = 4;
  const strip = findStrip(state, new Set());
  mustOk(applyCommand(state, {
    kind: "placeRoads",
    cells: [0, 1, 2].map((dy) => cellKey(strip.x, strip.y + dy)),
  }));
  for (const [dy, type] of [[0, "farm"], [1, "well"], [2, "workshop"]] as const) {
    mustOk(applyCommand(state, { kind: "placeBuilding", type, x: strip.x + strip.side, y: strip.y + dy }));
  }
  const home = freeCell(state, new Set(stripCells(strip)));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
  stepTicks(state, 3);
  return { state, ids: idsByType(state) };
}

/** Building ids by type (D2 shifts the counters; never hardcode). */
function idsByType(state: GameState): {
  farm: string; well: string; workshop: string; residence: string;
} {
  const ids = { farm: "", well: "", workshop: "", residence: "" };
  for (const [id, b] of Object.entries(state.buildings)) {
    if (b.type === "farm") ids.farm = id;
    if (b.type === "well") ids.well = id;
    if (b.type === "workshop") ids.workshop = id;
    if (b.type === "residence") ids.residence = id;
  }
  return ids;
}

describe("deactivation effects", () => {
  it("stops maintenance, commerce and housing, and reactivation applies next tick", () => {
    const { state, ids } = settledState();
    const m0 = state.resources.money;
    stepTicks(state, 1);
    expect(state.resources.money - m0).toBe(-2); // 1 tax + 2 commerce − 4 upkeep

    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: false }));
    const m1 = state.resources.money;
    stepTicks(state, 1);
    // commerce 0, upkeep 3 → net 1 − 3 = −2
    expect(state.resources.money).toBe(m1 - 1);

    expect(housingCapacity(state)).toBe(1);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.residence, active: false }));
    expect(housingCapacity(state)).toBe(0);

    // deactivate + reactivate between ticks: the next tick behaves as active
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: true }));
    const m2 = state.resources.money;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(m2 - 2);
  });

  it("a deactivated farm leaves pop 1 on the Center trickle and starves pop 2", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.farm, active: false }));
    expect(state.buildings[ids.farm]?.staffed).toBe(false);
    const foodAtPop1 = state.resources.food;
    stepTicks(state, 2);
    expect(state.population).toBe(1);
    expect(state.resources.food).toBe(foodAtPop1); // trickle covers exactly
    state.population = 2;
    state.resources.food = 3;
    stepTicks(state, 4); // 3→2→1→0 then one unfed colonist is lost
    expect(state.population).toBe(1);
    stepTicks(state, 1); // the trickle sustains the survivor (anti-lock, Step015)
    expect(state.population).toBe(1);
  });

  it("deactivated wells stop water production; reactivation restores it", () => {
    const state = freshState();
    state.resources.money = 400;
    stripToAnchor(state);
    state.population = 0;
    state.resources.water = 6;
    const strip = findStrip(state, new Set());
    mustOk(applyCommand(state, {
      kind: "placeRoads",
      cells: [0, 1, 2].map((dy) => cellKey(strip.x, strip.y + dy)),
    }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: strip.x + strip.side, y: strip.y }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: strip.x + strip.side, y: strip.y + 1 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: strip.x + strip.side, y: strip.y + 2 }));
    const used = new Set(stripCells(strip));
    for (let i = 0; i < 3; i++) {
      const home = freeCell(state, used);
      used.add(cellKey(home.x, home.y));
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
    }
    stepTicks(state, 8); // admissions: pop 3; both wells staffed
    expect(state.population).toBe(3);

    const wellIds = Object.values(state.buildings)
      .filter((b) => b.type === "well")
      .map((b) => b.id)
      .sort();
    if (wellIds.length !== 2) throw new Error("expected 2 wells");
    const [wellA, wellB] = wellIds as [string, string];
    for (const id of [wellA, wellB]) {
      mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: false }));
    }
    stepTicks(state, 6); // production 0, served 3/tick → drains to 0
    expect(state.resources.water).toBe(0);
    expect(state.population).toBe(3); // alive (food unaffected); admission blocked

    for (const id of [wellA, wellB]) {
      mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: true }));
    }
    stepTicks(state, 2);
    expect(state.resources.water).toBeGreaterThan(0);
  });

  it("redistributes staffing deterministically when a workplace is mothballed", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.money = 300;
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const farmSpot = adjacentFree(state, road.x, road.y);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: farmSpot.x, y: farmSpot.y }));
    const farmId = `building-${state.buildingCounter - 1}`;
    const road2 = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road2.x, road2.y)] }));
    const wellSpot = adjacentFree(state, road2.x, road2.y);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: wellSpot.x, y: wellSpot.y }));
    const wellId = `building-${state.buildingCounter - 1}`;
    stepTicks(state, 3);
    state.population = 2;
    stepTicks(state, 1);
    expect(state.buildings[farmId]?.staffed).toBe(true);
    expect(state.buildings[wellId]?.staffed).toBe(true);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: farmId, active: false }));
    stepTicks(state, 1);
    expect(state.buildings[farmId]?.staffed).toBe(false);
    expect(state.buildings[wellId]?.staffed).toBe(true);
  });
});

describe("anchor protection", () => {
  it("refuses to deactivate or re-target the Colony Center, and rejects unknown ids", () => {
    const state = freshState();
    for (const active of [false, true]) {
      expect(
        applyCommand(state, { kind: "setBuildingActive", id: "colony-center", active }),
      ).toEqual({ ok: false, reason: "anchorProtected" });
    }
    expect(state.buildings["colony-center"]?.active).toBe(true);
    expect(
      applyCommand(state, { kind: "setBuildingActive", id: "building-99", active: false }),
    ).toEqual({ ok: false, reason: "unknownBuilding" });
  });
});

describe("zero-treasury recovery via mothballing (any composition)", () => {
  it("W > F recovers money while keeping the capital; W = F sheds the drain only", () => {
    const { state, ids } = settledState();
    const occupied = new Set(Object.values(state.buildings).map((b) => cellKey(b.x, b.y)));
    for (const cell of allRoadCells(state.roads)) occupied.add(cell);
    const strip2 = findStrip(state, occupied);
    mustOk(applyCommand(state, {
      kind: "placeRoads",
      cells: [0, 1, 2].map((dy) => cellKey(strip2.x, strip2.y + dy)),
    }));
    mustOk(applyCommand(state, {
      kind: "placeBuilding", type: "workshop", x: strip2.x + strip2.side, y: strip2.y,
    }));
    const workshop2 = `building-${state.buildingCounter - 1}`;
    stepTicks(state, 2); // second workshop operational
    // frozen: revenue 1 tax (gate closed below pop 8), upkeep 4 → net −3, clamped
    state.resources.money = 0;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(0);
    // mothball every workplace: upkeep 0 → +1/tick, pop 1 survives on the trickle
    for (const id of [ids.farm, ids.well, ids.workshop, workshop2]) {
      mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: false }));
    }
    stepTicks(state, 5);
    expect(state.population).toBeGreaterThanOrEqual(1);
    expect(state.resources.money).toBe(5); // a genuine spending window
    // reactivating refreezes the colony: the saved 5 drains, the population lives
    for (const id of [ids.farm, ids.well, ids.workshop, workshop2]) {
      mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: true }));
    }
    stepTicks(state, 3);
    expect(state.resources.money).toBe(0);
    expect(state.population).toBeGreaterThanOrEqual(1);

    // W = F: mothball well + workshop → upkeep 1, net 0, no accumulation
    const even = settledState();
    even.state.resources.money = 0;
    stepTicks(even.state, 1);
    expect(even.state.resources.money).toBe(0);
    for (const id of [even.ids.well, even.ids.workshop]) {
      mustOk(applyCommand(even.state, { kind: "setBuildingActive", id, active: false }));
    }
    stepTicks(even.state, 5);
    expect(even.state.population).toBeGreaterThanOrEqual(1);
    expect(even.state.resources.money).toBe(0);
  });
});

describe("persistence", () => {
  it("round-trips inactive state, migrates v13 to active, rejects older versions", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: false }));
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(restored.buildings[ids.well]?.active).toBe(false);

    const fresh = freshState();
    const doc = serialize(fresh) as unknown as Record<string, unknown>;
    const v13: Record<string, unknown> = { ...doc, formatVersion: MIGRATABLE_SAVE_VERSION };
    v13.buildings = (v13.buildings as Array<Record<string, unknown>>).map(
      ({ active: _active, ...rest }) => rest,
    );
    expect(parseSave(v13)).toEqual(fresh); // active: true everywhere

    expect(() => parseSave({ ...doc, formatVersion: 12 })).toThrow(SaveValidationError);
  });
});

describe("determinism", () => {
  it("identical states and commands produce identical outcomes", () => {
    const a = settledState();
    const b = settledState();
    for (const f of [a, b]) {
      mustOk(applyCommand(f.state, { kind: "setBuildingActive", id: f.ids.well, active: false }));
      stepTicks(f.state, 6);
      mustOk(applyCommand(f.state, { kind: "setBuildingActive", id: f.ids.well, active: true }));
      stepTicks(f.state, 3);
    }
    expect(b.state).toEqual(a.state);
  });
});
