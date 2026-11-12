import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  environmentalQuality,
  MIN_QUALITY_FOR_ADMISSION,
  ABSORPTION_PER_PARK_PER_TICK,
  pollutionContributionPerTick,
  pollutionFlows,
  pollutionTicksToAdmissionBlock,
} from "@/domain/environment/environment.js";
import { getColonyStats } from "@/application/queries/stats.js";
import { getAlerts } from "@/application/queries/analysis.js";
import { parseSave, serialize } from "@/application/persistence/save.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "env-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Matured connected workshop + residence (the polluting pair), pop 1. */
function pollutingColony(): GameState {
  const state = freshState();
  state.resources.money = 300;
  stripToAnchor(state);
  state.population = 0;
  state.resources.water = 2;
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const spot = adjacentFree(state, road.x, road.y);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
  const used = new Set([cellKey(road.x, road.y), cellKey(spot.x, spot.y)]);
  const home = freeCell(state, used);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
  stepTicks(state, 3);
  return state;
}

describe("pollution flows", () => {
  it("a clean colony emits nothing and keeps quality 100", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    stepTicks(state, 5);
    expect(state.pollution).toBe(0);
    expect(environmentalQuality(state)).toBe(100);
  });

  it("an active workshop emits 1/tick; mothballing stops it with no natural decay", () => {
    const state = pollutingColony();
    // Step064: emission runs before assignJobs, so it follows the staffing set
    // of the output — operational at tick 2, first emitting tick is tick 3
    expect(state.pollution).toBe(1);
    const wsId = Object.values(state.buildings).find((b) => b.type === "workshop")?.id;
    if (!wsId) throw new Error("workshop missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wsId, active: false }));
    const before = state.pollution;
    stepTicks(state, 2);
    expect(state.pollution).toBe(before);
  });

  it("parks absorb 2/tick to the floor, pollution clamps at 100", () => {
    const state = pollutingColony();
    // keep the emitting workshop shut so the arithmetic is parks-only
    const wsId = Object.values(state.buildings).find((b) => b.type === "workshop")?.id;
    if (!wsId) throw new Error("workshop missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wsId, active: false }));
    for (let i = 0; i < 3; i++) {
      const spot = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 2); // parks mature
    state.pollution = 10;
    stepTicks(state, 1); // 10 − 3·2 = 4
    expect(state.pollution).toBe(4);
    stepTicks(state, 1); // clamped at 0
    expect(state.pollution).toBe(0);
    expect(ABSORPTION_PER_PARK_PER_TICK).toBe(2);

    const smog = pollutingColony();
    smog.pollution = 99;
    stepTicks(smog, 3);
    expect(smog.pollution).toBe(100);
    expect(environmentalQuality(smog)).toBe(0);
  });
});

describe("staffed-only emission (Step064)", () => {
  it("an idling workshop emits nothing and starts emitting the same tick as its output", () => {
    const state = freshState();
    state.resources.money = 300;
    state.resources.water = 2;
    stripToAnchor(state);
    state.population = 0;
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const spot = adjacentFree(state, road.x, road.y);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    stepTicks(state, 5);
    const workshop = Object.values(state.buildings).find((b) => b.type === "workshop");
    expect(workshop?.staffed).toBe(false);
    expect(pollutionFlows(state)).toEqual({ emissions: 0, absorption: 0, net: 0 });
    expect(state.pollution).toBe(0);

    state.population = 1; // the colonist fills the workplace at the end of the tick
    stepTicks(state, 1);
    expect(workshop?.staffed).toBe(true);
    expect(state.pollution).toBe(0); // no work done yet
    stepTicks(state, 2);
    expect(state.pollution).toBe(2);
  });

  it("a park still absorbs while unstaffed (parks have no job capacity)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
    stepTicks(state, 2);
    expect(pollutionFlows(state).absorption).toBe(ABSORPTION_PER_PARK_PER_TICK);
  });
});

describe("environmental admission gate", () => {
  it("blocks growth below quality 25 while staying bootstrap-exempt, and re-opens on recovery", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.water = 10;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 2, y: 1 }));
    state.pollution = 90; // quality 10 < 25
    stepTicks(state, 5);
    expect(state.population).toBe(1); // first colonist admitted (pop 0 exempt)
    expect(MIN_QUALITY_FOR_ADMISSION).toBe(25);
    state.pollution = 0; // air clears (e.g. parks did their job)
    stepTicks(state, 2);
    expect(state.population).toBe(2);
  });
});

describe("environment persistence + alerts", () => {
  it("migrates a v14 save (pollution 0) and round-trips pollution", () => {
    const state = freshState();
    const doc = serialize(state) as unknown as Record<string, unknown>;
    const v14 = { ...doc, formatVersion: 14 } as Record<string, unknown>;
    delete v14.pollution;
    const migrated = parseSave(v14);
    expect(migrated.pollution).toBe(0);
    expect(migrated).toEqual(state);

    const dirty = pollutingColony();
    dirty.pollution = 42;
    expect(parseSave(serialize(dirty))).toEqual(dirty);
  });

  it("alerts info below quality 50, warning below 25, silent when clean", () => {
    const state = pollutingColony();
    state.pollution = 60;
    expect(getAlerts(state).filter((a) => a.message.startsWith("Environment"))).toEqual([
      { severity: "info", message: "Environment: quality 40 · pollution 60" },
    ]);
    state.pollution = 80;
    expect(getAlerts(state).filter((a) => a.message.startsWith("Environment"))).toEqual([
      { severity: "warning", message: "Environment: quality 20 · pollution 80" },
    ]);

    const clean = freshState();
    stripToAnchor(clean);
    clean.population = 0;
    expect(getAlerts(clean)).toEqual([]);
  });

  it("is deterministic", () => {
    const a = pollutingColony();
    const b = pollutingColony();
    for (const s of [a, b]) {
      const spot = freeCell(s);
      mustOk(applyCommand(s, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
      stepTicks(s, 7);
    }
    expect(b).toEqual(a);
  });
});

describe("pollutionFlows pure query + stats (Step053 F1)", () => {
  it("counts both sides without mutating, and stats surface the same totals", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    expect(getColonyStats(state)).toMatchObject({
      pollutionEmissionsPerTick: 0,
      pollutionAbsorptionPerTick: 0,
      pollutionNetPerTick: 0,
    });

    const dirty = freshState();
    stripToAnchor(dirty);
    dirty.resources.money = 500;
    dirty.resources.water = 4;
    for (let i = 0; i < 2; i++) {
      const road = freeCell(dirty);
      mustOk(applyCommand(dirty, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
      const spot = adjacentFree(dirty, road.x, road.y);
      mustOk(applyCommand(dirty, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    }
    stepTicks(dirty, 2); // both operational
    dirty.population = 2; // Step064: emission requires staffing
    stepTicks(dirty, 1);
    expect(pollutionFlows(dirty)).toEqual({ emissions: 2, absorption: 0, net: 2 });
    expect(getColonyStats(dirty).pollutionNetPerTick).toBe(2);

    const parkSpot = freeCell(dirty);
    mustOk(applyCommand(dirty, { kind: "placeBuilding", type: "park", x: parkSpot.x, y: parkSpot.y }));
    stepTicks(dirty, 2); // park matures
    expect(pollutionFlows(dirty)).toEqual({ emissions: 2, absorption: 2, net: 0 });
    expect(dirty.pollution).toBeGreaterThan(0); // pure: nothing clamped here
  });
});

describe("per-building pollution contribution (Step056)", () => {
  it("maps every building type, and the inspection cannot drift from the flows", () => {
    const expected: [Parameters<typeof pollutionContributionPerTick>[0], number][] = [
      ["workshop", 1],
      ["quarry", 1],
      ["park", -ABSORPTION_PER_PARK_PER_TICK],
      ["farm", 0],
      ["well", 0],
      ["residence", 0],
      ["lumberCamp", 0],
      ["warehouse", 0],
      ["colonyCenter", 0],
    ];
    for (const [type, contribution] of expected) {
      expect(pollutionContributionPerTick(type), type).toBe(contribution);
    }

    const state = pollutingColony(); // one active workshop
    expect(pollutionFlows(state)).toEqual({ emissions: 1, absorption: 0, net: 1 });
    expect(getColonyStats(state).pollutionNetPerTick).toBe(
      pollutionContributionPerTick("workshop"),
    );
  });
});

describe("admission-block forecast (Step056 F1)", () => {
  it("is null while pollution is stable or falling", () => {
    const clean = freshState();
    stripToAnchor(clean);
    clean.population = 0;
    expect(pollutionTicksToAdmissionBlock(clean)).toBeNull();
    expect(getColonyStats(clean).pollutionTicksToAdmissionBlock).toBeNull();

    const state = pollutingColony();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
    stepTicks(state, 2);
    expect(pollutionFlows(state).net).toBe(-1);
    expect(pollutionTicksToAdmissionBlock(state)).toBeNull();
  });

  it("counts the exact ticks until the gate closes", () => {
    const state = pollutingColony(); // +1/tick
    state.pollution = 70; // quality 30 — gate closes above pollution 75
    expect(pollutionTicksToAdmissionBlock(state)).toBe(6);
    state.pollution = 75; // quality 25: still admitting
    expect(pollutionTicksToAdmissionBlock(state)).toBe(1);
    state.pollution = 76; // quality 24: closed
    expect(pollutionTicksToAdmissionBlock(state)).toBe(0);
    expect(getColonyStats(state).pollutionTicksToAdmissionBlock).toBe(0);
  });

  it("scales with the net flow (two staffed workshops burn the margin twice as fast)", () => {
    const state = pollutingColony();
    state.population = 2;
    state.resources.money = 300;
    state.resources.water = 4;
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const spot = adjacentFree(state, road.x, road.y);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    stepTicks(state, 2); // second workshop operational → net +2
    state.pollution = 63; // 63 + 2·6 = 75 (last clean tick)
    expect(pollutionFlows(state).net).toBe(2);
    expect(pollutionTicksToAdmissionBlock(state)).toBe(7);
  });
});
