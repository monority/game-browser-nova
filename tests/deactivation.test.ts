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
import { freeCell, mustOk } from "./helpers.js";

const CONFIG = { seed: "deactivate-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** First free vertical 3-cell strip with a free adjacent column, deterministically. */
function findStrip(state: GameState, skip: Set<string>): { x: number; y: number; side: number } {
  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < state.world.width && y < state.world.height &&
    !state.world.blockedCells[cellKey(x, y)] && !skip.has(cellKey(x, y));
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
    ids: { farm: "building-1", well: "building-2", workshop: "building-3", residence: "building-4" },
  };
}

describe("deactivation effects", () => {
  it("stops maintenance at the next economy calculation", () => {
    const { state, ids } = settledState();
    const m0 = state.resources.money;
    stepTicks(state, 1);
    const netWithAll = state.resources.money - m0; // 1 tax + 2 commerce − 4 maint = −1
    expect(netWithAll).toBe(-1);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: false }));
    const m1 = state.resources.money;
    stepTicks(state, 1);
    // workshop mothballed: commerce 0, maintenance 3 → net = 1 − 3 = −2
    expect(state.resources.money).toBe(m1 - 2);
  });

  it("deactivated farm produces nothing and feeds no one (staffing isolation)", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.farm, active: false }));
    expect(state.buildings[ids.farm]?.staffed).toBe(false);
    state.resources.food = 1; // one tick of food left
    stepTicks(state, 3); // stock exhausts → all-or-nothing starvation
    expect(state.population).toBe(0); // unchanged contract
  });

  it("deactivated workshop earns no commerce even when road-connected", () => {
    const { state, ids } = settledState();
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.workshop, active: false }));
    const m0 = state.resources.money;
    stepTicks(state, 1);
    // 1 tax + 0 commerce − 3 maintenance = −2
    expect(state.resources.money).toBe(m0 - 2);
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
    expect(state.resources.money).toBe(m0 - 1);
  });

  it("availableJobs excludes mothballed workplaces", () => {
    const { state, ids } = settledState();
    expect(availableJobs(state)).toBe(3); // farm + well + workshop
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: false }));
    expect(availableJobs(state)).toBe(2);
  });

  it("staffing redistributes deterministically when a workplace is mothballed", () => {
    const state = freshState();
    state.resources.money = 300;
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0), cellKey(0, 1)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 1, y: 1 }));
    stepTicks(state, 3);
    state.population = 2;
    stepTicks(state, 1);
    expect(state.buildings["building-1"]?.staffed).toBe(true);
    expect(state.buildings["building-2"]?.staffed).toBe(true);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: "building-1", active: false }));
    stepTicks(state, 1);
    // the colonist moves to the well, deterministically
    expect(state.buildings["building-1"]?.staffed).toBe(false);
    expect(state.buildings["building-2"]?.staffed).toBe(true);
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
  it("W > F: mothballing the well recovers a frozen colony — money accumulates, capital kept", () => {
    const { state, ids } = settledState();
    // add a second connected workshop on another strip → W = 2, F = 1
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
    stepTicks(state, 2); // second workshop operational

    // frozen: revenue = 1 tax + 4 commerce (2 ws) = 5,
    // maintenance = 6 (res + farm + well + 2 ws) → net −1 → clamped at 0
    state.resources.money = 0;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(0);

    // mothball the well → active buildings = 4 → net = 1 + 4 − 4 = +1
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: false }));
    stepTicks(state, 5);
    expect(state.population).toBeGreaterThanOrEqual(1); // alive throughout
    expect(state.resources.money).toBe(5); // +1/tick — growth genuinely restarts

    // reactivate → net back to 0, money preserved (capital was never lost)
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: true }));
    stepTicks(state, 3);
    expect(state.resources.money).toBe(5);
  });

  it("W = F: mothballing sheds the drain but the net-0 boundary still holds", () => {
    const { state, ids } = settledState();
    // frozen: revenue = 1 + 2 = 3, maintenance = 4 → net −1
    state.resources.money = 0;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(0);

    // mothball the well → net = 1 + 2 − 3 = 0: alive, no accumulation
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: ids.well, active: false }));
    stepTicks(state, 5);
    expect(state.population).toBeGreaterThanOrEqual(1);
    expect(state.resources.money).toBe(0);
  });
});

describe("persistence", () => {
  it("exposes SAVE_VERSION 14 with migratable v13", () => {
    expect(SAVE_VERSION).toBe(14);
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
    const v13: Record<string, unknown> = { ...doc, formatVersion: SAVE_VERSION - 1 };
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
    for (const s of [a.state, b.state]) {
      mustOk(applyCommand(s, { kind: "setBuildingActive", id: "building-2", active: false }));
      stepTicks(s, 6);
      mustOk(applyCommand(s, { kind: "setBuildingActive", id: "building-2", active: true }));
      stepTicks(s, 3);
    }
    expect(b.state).toEqual(a.state);
  });
});
