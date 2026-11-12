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
import {
  parseSave,
  serialize,
} from "@/application/persistence/save.js";
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
  it("clean colony: no emissions, quality 100", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    stepTicks(state, 5);
    expect(state.pollution).toBe(0);
    expect(environmentalQuality(state)).toBe(100);
  });

  it("active workshop emits 1/tick; mothballed emits nothing", () => {
    const state = pollutingColony();
    // Step064: emission now runs before assignJobs, so it follows the same
    // staffing set as the output — operational at tick 2, first emission at
    // tick 3 → 1 emitting tick so far
    expect(state.pollution).toBe(1);
    const wsId = Object.values(state.buildings).find((b) => b.type === "workshop")?.id;
    if (!wsId) throw new Error("workshop missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wsId, active: false }));
    const before = state.pollution;
    stepTicks(state, 2);
    expect(state.pollution).toBe(before); // no emission, no natural decay
  });

  it("parks absorb 2/tick and clamp at 0", () => {
    const state = pollutingColony();
    for (let i = 0; i < 3; i++) {
      const spot = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 2); // parks mature
    state.pollution = 10;
    stepTicks(state, 1); // +1 emission − 3·2 absorption → 10 + 1 − 6 = 5
    expect(state.pollution).toBe(5);
    stepTicks(state, 1); // 5 + 1 − 6 → clamped at 0
    expect(state.pollution).toBe(0);
    expect(ABSORPTION_PER_PARK_PER_TICK).toBe(2);
  });

  it("pollution clamps at 100", () => {
    const state = pollutingColony();
    state.pollution = 99;
    stepTicks(state, 3);
    expect(state.pollution).toBe(100);
    expect(environmentalQuality(state)).toBe(0);
  });
});

describe("staffed-only emission (Step064)", () => {
  it("an idling workshop emits nothing and starts the same tick as its output", () => {
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
    stepTicks(state, 2); // now it works and emits, one tick per tick
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
  it("growth stops when quality < 25; bootstrap exemption still admits at pop 0", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 }));
    state.pollution = 90; // quality 10 < 25
    stepTicks(state, 5);
    expect(state.population).toBe(1); // first colonist admitted (pop 0 exempt)
    // second residence: further growth blocked by quality
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 2, y: 1 }));
    stepTicks(state, 5);
    expect(state.population).toBe(1);
    expect(MIN_QUALITY_FOR_ADMISSION).toBe(25);
  });

  it("quality recovery re-opens growth", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 1 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 2, y: 1 }));
    state.resources.water = 10; // headroom for admissions
    state.pollution = 90;
    stepTicks(state, 3);
    expect(state.population).toBe(1);
    state.pollution = 0; // air clears (e.g. parks did their job)
    stepTicks(state, 2);
    expect(state.population).toBe(2);
  });
});

describe("environment persistence + alerts", () => {
  it("v14 save migrates: pollution defaults to 0", () => {
    const state = freshState();
    const doc = serialize(state) as unknown as Record<string, unknown>;
    const v14 = { ...doc, formatVersion: 14 };
    delete (v14 as Record<string, unknown>).pollution;
    const migrated = parseSave(v14);
    expect(migrated.pollution).toBe(0);
    expect(migrated).toEqual(state);
  });

  it("round-trips pollution", () => {
    const state = pollutingColony();
    state.pollution = 42;
    const migrated = parseSave(serialize(state));
    expect(migrated).toEqual(state);
    expect(migrated.pollution).toBe(42);
  });

  it("alerts when quality degrades (info < 50, warning < 25)", () => {
    const state = pollutingColony();
    state.pollution = 60;
    expect(getAlerts(state).filter((a) => a.message.startsWith("Environment"))).toEqual([
      { severity: "info", message: "Environment: quality 40 · pollution 60" },
    ]);
    state.pollution = 80;
    expect(getAlerts(state).filter((a) => a.message.startsWith("Environment"))).toEqual([
      { severity: "warning", message: "Environment: quality 20 · pollution 80" },
    ]);
  });

  it("no environment alert while the air is clean", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    expect(getAlerts(state)).toEqual([]);
  });

  it("environment flows are deterministic", () => {
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

describe("pollutionFlows pure query (Step053 F1)", () => {
  it("counts workshop emissions and park absorption without mutating", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.money = 500;
    state.resources.water = 4;
    // two matured road-adjacent workshops (dynamic free cells: obstacles)
    for (let i = 0; i < 2; i++) {
      const road = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
      const spot = adjacentFree(state, road.x, road.y);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 2);
    const flows = pollutionFlows(state);
    expect(flows).toEqual({ emissions: 2, absorption: 0, net: 2 });
    // one matured park flips the balance to net 0
    const parkSpot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "park", x: parkSpot.x, y: parkSpot.y }));
    stepTicks(state, 2);
    expect(pollutionFlows(state)).toEqual({ emissions: 2, absorption: 2, net: 0 });
    expect(state.pollution).toBeGreaterThan(0); // pure: nothing clamped here
  });

  it("surfaces the flows through the colony stats query", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    const stats = getColonyStats(state);
    expect(stats.pollutionEmissionsPerTick).toBe(0);
    expect(stats.pollutionAbsorptionPerTick).toBe(0);
    expect(stats.pollutionNetPerTick).toBe(0);
  });
});

describe("per-building pollution contribution (Step056)", () => {
  it("maps every building type to its per-tick contribution", () => {
    expect(pollutionContributionPerTick("workshop")).toBe(1);
    expect(pollutionContributionPerTick("quarry")).toBe(1);
    expect(pollutionContributionPerTick("park")).toBe(-ABSORPTION_PER_PARK_PER_TICK);
    expect(pollutionContributionPerTick("farm")).toBe(0);
    expect(pollutionContributionPerTick("well")).toBe(0);
    expect(pollutionContributionPerTick("residence")).toBe(0);
    expect(pollutionContributionPerTick("lumberCamp")).toBe(0);
    expect(pollutionContributionPerTick("warehouse")).toBe(0);
    expect(pollutionContributionPerTick("market")).toBe(0);
    expect(pollutionContributionPerTick("colonyCenter")).toBe(0);
  });

  it("feeds the same totals as pollutionFlows (inspection and stock cannot drift)", () => {
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

    // one park flips a one-workshop colony to net -1: no deadline at all
    const state = pollutingColony();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
    stepTicks(state, 2);
    expect(pollutionFlows(state).net).toBe(-1);
    expect(pollutionTicksToAdmissionBlock(state)).toBeNull();
  });

  it("counts the exact ticks until quality closes the admission gate", () => {
    const state = pollutingColony(); // +1/tick
    state.pollution = 70; // quality 30 — gate closes above pollution 75
    expect(pollutionTicksToAdmissionBlock(state)).toBe(6);
    state.pollution = 75; // quality 25: still admitting
    expect(pollutionTicksToAdmissionBlock(state)).toBe(1);
    state.pollution = 76; // quality 24: closed
    expect(pollutionTicksToAdmissionBlock(state)).toBe(0);
    expect(getColonyStats(state).pollutionTicksToAdmissionBlock).toBe(0);
  });

  it("scales with the net flow (two workshops burn the margin twice as fast)", () => {
    const state = pollutingColony();
    // Step064: emission requires staffing, so the second workshop needs a
    // second colonist to count (otherwise it idles and emits nothing)
    state.population = 2;
    state.resources.money = 300;
    state.resources.water = 4;
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const spot = adjacentFree(state, road.x, road.y);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    stepTicks(state, 2); // second workshop operational → net +2
    state.pollution = 63; // 63 + 2·6 = 75 (last clean tick), 77 on the 7th
    expect(pollutionFlows(state).net).toBe(2);
    expect(pollutionTicksToAdmissionBlock(state)).toBe(7);
  });
});
