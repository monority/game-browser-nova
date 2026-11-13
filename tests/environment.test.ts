import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  environmentalQuality,
  MIN_QUALITY_FOR_ADMISSION,
  ABSORPTION_PER_PARK_PER_TICK,
  pollutionFlows,
  pollutionTicksToAdmissionBlock,
} from "@/domain/environment/environment.js";
import { getColonyStats } from "@/application/queries/stats.js";
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

});
