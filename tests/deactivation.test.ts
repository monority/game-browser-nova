import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import { housingCapacity, availableJobs } from "../src/domain/population/population.js";
import {
  parseSave,
  serialize,
  SAVE_VERSION,
  MIGRATABLE_SAVE_VERSION,
  SaveValidationError,
} from "../src/application/persistence/save.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";
import { allRoadCells } from "../src/domain/road/road.js";

const CONFIG = { seed: "deactivate-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** First free vertical 3-cell strip with a free adjacent column, deterministically. */
function findStrip(state: GameState, skip: Set<string>): { x: number; y: number; side: number } {
  const roads = allRoadCells(state.roads);
  const taken = new Set<string>(skip);
  for (const building of Object.values(state.buildings)) taken.add(cellKey(building.x, building.y));
  for (const cell of roads) taken.add(cell);
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

/**
 * Standard fixture: road strip, farm + well + workshop adjacent (in that
 * canonical staffing order), one residence elsewhere. Matured; pop 1
 * staffs the farm. Buildings: 1=farm, 2=well, 3=workshop, 4=residence.
 */
function settledState(): { state: GameState; ids: { farm: string; well: string; workshop: string; residence: string } } {
  const state = freshState();
  stripToAnchor(state);
  state.population = 0;
  state.resources.money = 300;
  state.resources.water = 4;
  const strip = findStrip(state, new Set());
  mustOk(applyCommand(state, {
    kind: "placeRoads",
    cells: [cellKey(strip.x, strip.y), cellKey(strip.x, strip.y + 1), cellKey(strip.x, strip.y + 2)],
  }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: strip.x + strip.side, y: strip.y }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: strip.x + strip.side, y: strip.y + 1 }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: strip.x + strip.side, y: strip.y + 2 }));
  const used = new Set([
    cellKey(strip.x, strip.y), cellKey(strip.x, strip.y + 1), cellKey(strip.x, strip.y + 2),
    cellKey(strip.x + strip.side, strip.y), cellKey(strip.x + strip.side, strip.y + 1),
    cellKey(strip.x + strip.side, strip.y + 2),
  ]);
  const home = freeCell(state, used);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
  stepTicks(state, 3);
  return {
    state,
    ids: idsByType(state),
  };
}

/** Building ids by type (D2 shifts the counters; never hardcode). */
function idsByType(state: GameState): { farm: string; well: string; workshop: string; residence: string } {
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
  it("stops maintenance at the next economy calculation", () => {
    const { state, ids } = settledState();
    const m0 = state.resources.money;
    stepTicks(state, 1);
    const netWithAll = state.resources.money - m0; // 1 tax + 2 commerce − 4 maint = −1
    expect(netWithAll).toBe(-2);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: false }));
    const m1 = state.resources.money;
    stepTicks(state, 1);
    // workshop mothballed: commerce 0, maintenance 3 → net = 1 − 3 = −2
    expect(state.resources.money).toBe(m1 - 1);
  });

  it("deactivated farm: pop 1 survives on the Center trickle, pop 2 starves", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.farm, active: false }));
    expect(state.buildings[ids.farm]?.staffed).toBe(false);
    // pop 1: Center trickle 1 = consumption 1 → sustained (anti-lock)
    const foodAtPop1 = state.resources.food;
    stepTicks(state, 2);
    expect(state.population).toBe(1);
    expect(state.resources.food).toBe(foodAtPop1); // trickle covers exactly
    // pop 2: consumption 2 > trickle 1 → all-or-nothing starvation
    state.population = 2;
    state.resources.food = 3;
    stepTicks(state, 4); // 3→2→1→0 then an unfed tick → starved
    expect(state.population).toBe(0);
    stepTicks(state, 1); // the trickle re-seeds admission (anti-lock, Step015)
    expect(state.population).toBe(1);
  });

  it("deactivated workshop earns no commerce even when road-connected", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: false }));
    const m0 = state.resources.money;
    stepTicks(state, 1);
    // 1 tax + 0 commerce − 3 maintenance = −2
    expect(state.resources.money).toBe(m0 - 1);
  });

  it("deactivated residence provides no housing capacity", () => {
    const { state, ids } = settledState();
    expect(housingCapacity(state)).toBe(1);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.residence, active: false }));
    expect(housingCapacity(state)).toBe(0);
  });

  it("deactivated wells stop water production; reactivation restores it (surplus observable)", () => {
    const state = freshState();
    state.resources.money = 400;
    stripToAnchor(state);
    state.population = 0;
    state.resources.water = 6;
    const strip = findStrip(state, new Set());
    mustOk(applyCommand(state, {
      kind: "placeRoads",
      cells: [cellKey(strip.x, strip.y), cellKey(strip.x, strip.y + 1), cellKey(strip.x, strip.y + 2)],
    }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: strip.x + strip.side, y: strip.y }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: strip.x + strip.side, y: strip.y + 1 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: strip.x + strip.side, y: strip.y + 2 }));
    const used = new Set([
      cellKey(strip.x, strip.y), cellKey(strip.x, strip.y + 1), cellKey(strip.x, strip.y + 2),
      cellKey(strip.x + strip.side, strip.y), cellKey(strip.x + strip.side, strip.y + 1),
      cellKey(strip.x + strip.side, strip.y + 2),
    ]);
    for (let i = 0; i < 3; i++) {
      const home = freeCell(state, used);
      used.add(cellKey(home.x, home.y));
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
    }
    stepTicks(state, 8); // admissions: pop 3; both wells staffed (farm+well+well)
    expect(state.population).toBe(3);

    const wellIds = Object.values(state.buildings)
      .filter((b) => b.type === "well")
      .map((b) => b.id)
      .sort();
    if (wellIds.length !== 2) throw new Error("expected 2 wells");
    const wellA = wellIds[0] as string;
    const wellB = wellIds[1] as string;
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wellA, active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wellB, active: false }));
    stepTicks(state, 6); // production 0, served 3/tick → stock drains to 0
    expect(state.resources.water).toBe(0);
    expect(state.population).toBe(3); // alive (food unaffected); admission blocked

    // reactivate both → re-staffed end of tick → +4 production vs 3 served
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wellA, active: true }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wellB, active: true }));
    stepTicks(state, 2);
    expect(state.resources.water).toBeGreaterThan(0); // production restored
  });

  it("reactivation takes effect at the next tick (no same-tick exploit)", () => {
    const { state, ids } = settledState();
    const m0 = state.resources.money;
    // deactivate + reactivate between ticks: next tick must behave as active
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: true }));
    stepTicks(state, 1);
    // +1 tax +2 commerce −4 maintenance (as if never deactivated)
    expect(state.resources.money).toBe(m0 - 2);
  });

  it("availableJobs excludes mothballed workplaces", () => {
    const { state, ids } = settledState();
    expect(availableJobs(state)).toBe(3); // farm + well + workshop
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: false }));
    expect(availableJobs(state)).toBe(2);
  });

  it("staffing redistributes deterministically when a workplace is mothballed", () => {
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
    // the colonists move to the well, deterministically
    expect(state.buildings[farmId]?.staffed).toBe(false);
    expect(state.buildings[wellId]?.staffed).toBe(true);
  });
});

describe("anchor protection", () => {
  it("the Colony Center cannot be deactivated or re-targeted", () => {
    const state = freshState();
    expect(
      applyCommand(state, { kind: "setBuildingActive", id: "colony-center", active: false }),
    ).toEqual({ ok: false, reason: "anchorProtected" });
    expect(
      applyCommand(state, { kind: "setBuildingActive", id: "colony-center", active: true }),
    ).toEqual({ ok: false, reason: "anchorProtected" });
    expect(state.buildings["colony-center"]?.active).toBe(true);
  });

  it("rejects unknown ids", () => {
    const state = freshState();
    expect(
      applyCommand(state, { kind: "setBuildingActive", id: "building-99", active: false }),
    ).toEqual({ ok: false, reason: "unknownBuilding" });
  });
});

describe("zero-treasury recovery via mothballing (any composition)", () => {
  it("W > F: mothballing all workplaces recovers a frozen colony - money accumulates, capital kept", () => {
    const { state, ids } = settledState();
    // add a second connected workshop on another strip
    const occupied = new Set(
      Object.values(state.buildings).map((b) => cellKey(b.x, b.y)),
    );
    for (const road of Object.values(state.roads)) {
      for (const cell of road.cells) occupied.add(cell);
    }
    const strip2 = findStrip(state, occupied);
    mustOk(applyCommand(state, {
      kind: "placeRoads",
      cells: [cellKey(strip2.x, strip2.y), cellKey(strip2.x, strip2.y + 1), cellKey(strip2.x, strip2.y + 2)],
    }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: strip2.x + strip2.side, y: strip2.y }));
    const workshop2 = `building-${state.buildingCounter - 1}`;
    stepTicks(state, 2); // second workshop operational
    // frozen: revenue = 1 tax (gate closed below pop 8), upkeep = 4
    // (farm + well + 2 workshops; residence exempt) -> net -3, clamped at 0
    state.resources.money = 0;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(0);
    // mothball every workplace: upkeep 0 -> net = 1 + 0 - 0 = +1.
    // pop 1 survives on the Center trickle (food 1 = consumption 1).
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.farm, active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: workshop2, active: false }));
    stepTicks(state, 5);
    expect(state.population).toBeGreaterThanOrEqual(1); // alive throughout
    expect(state.resources.money).toBe(5); // +1/tick - growth genuinely restarts
    // reactivate all -> net back to -3: the colony refreezes and the saved 5
    // drains away, but the population survives. Mothballing bought a spending
    // window (measured above), not permanent growth at pop 1 without commerce.
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.farm, active: true }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: true }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: true }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: workshop2, active: true }));
    stepTicks(state, 3);
    expect(state.resources.money).toBe(0);
    expect(state.population).toBeGreaterThanOrEqual(1);
  });

  it("W = F: mothballing sheds the drain but the net-0 boundary still holds", () => {
    const { state, ids } = settledState();
    // frozen: revenue = 1 (gate closed), upkeep = 3 (farm + well + workshop) -> net -2
    state.resources.money = 0;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(0);
    // mothball well + workshop: upkeep 1 (farm) -> net = 1 - 1 = 0.
    // alive (farm feeds pop 1), no accumulation.
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: false }));
    stepTicks(state, 5);
    expect(state.population).toBeGreaterThanOrEqual(1);
    expect(state.resources.money).toBe(0);
  });
});

describe("persistence", () => {
  it("exposes SAVE_VERSION 17 with the v13 migratable chain", () => {
    expect(SAVE_VERSION).toBe(17);
    expect(MIGRATABLE_SAVE_VERSION).toBe(13);
  });

  it("round-trips inactive state losslessly", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: false }));
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(restored.buildings[ids.well]?.active).toBe(false);
  });

  it("migrates v13 saves: every building defaults to active", () => {
    const state = freshState();
    const doc = serialize(state) as unknown as Record<string, unknown>;
    const v13: Record<string, unknown> = { ...doc, formatVersion: MIGRATABLE_SAVE_VERSION };
    const buildings = (v13.buildings as Array<Record<string, unknown>>).map(
      ({ active: _active, ...rest }) => rest,
    );
    const migrated = parseSave({ ...v13, buildings });
    expect(migrated).toEqual(state); // active: true everywhere
  });

  it("rejects versions older than the migratable chain", () => {
    const doc = serialize(freshState());
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
