import { describe, expect, it } from "vitest";
import { cellKey, parseCellKey } from "@/domain/shared/cells.js";
import { type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  environmentalQuality,
  MIN_QUALITY_FOR_ADMISSION,
  ABSORPTION_PER_PARK_PER_TICK,
  pollutionFlows,
  pollutionIfMothballed,
  pollutionTicksToAdmissionBlock,
} from "@/domain/environment/environment.js";
import { getColonyStats } from "@/application/queries/stats.js";
import { parseSave, serialize } from "@/application/persistence/save.js";
import { stockedState, adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "env-test", width: 16, height: 16 };

function freshState(): GameState {
  return stockedState(CONFIG);
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
  it("an active workshop emits 1/tick without being staffed; mothballing stops it", () => {
    const state = pollutingColony();
    // Step083: emission follows activity, not staffing. This colony has pop 0,
    // so the workshop is never staffed and it still emits — operational at
    // tick 2, so ticks 2 and 3 have both emitted (Step064's gate would have
    // left it at 1, because it skipped the first, unstaffed tick).
    expect(state.pollution).toBe(2);
    const wsId = Object.values(state.buildings).find((b) => b.type === "workshop")?.id;
    if (!wsId) throw new Error("workshop missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wsId, active: false }));
    const before = state.pollution;
    stepTicks(state, 2);
    expect(state.pollution).toBe(before);
  });

  it("Step083: the opening park exactly pays for its two unstaffed shops; a third idle shop tips the air", () => {
    // The D2 opening has 10 workers for 5 farms + 5 wells, so both shops idle.
    // They still earn their 2/tick connection floor, and since Step083 they
    // also still emit: the park absorbs exactly that, net 0.
    const state = freshState();
    stepTicks(state, 3);
    const opening = pollutionFlows(state);
    expect(opening.emissions).toBe(2);
    expect(opening.absorption).toBe(ABSORPTION_PER_PARK_PER_TICK);
    expect(opening.net).toBe(0);

    // One more shop on an existing road is still unstaffed — and now it costs
    // the air 1/tick instead of paying for itself for free. That is the
    // free-revenue line (measured: 3 idle shops held pollution 0 through t=90
    // under Step064's gate; they now take the colony to `critical`).
    let spot: { x: number; y: number } | null = null;
    for (const road of Object.values(state.roads)) {
      for (const key of road.cells) {
        const cell = parseCellKey(key);
        try {
          spot = adjacentFree(state, cell.x, cell.y);
        } catch {
          continue; // this road cell's neighbours are all taken
        }
        break;
      }
      if (spot) break;
    }
    if (!spot) throw new Error("the opening has no road with a free neighbour");
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    stepTicks(state, 3);
    const extra = Object.values(state.buildings).find((b) => b.x === spot.x && b.y === spot.y);
    expect(extra?.staffed).toBe(false);
    expect(pollutionFlows(state).net).toBe(1);
  });

  it("Step083: says which park is load-bearing by what its removal would leave", () => {
    const state = freshState();
    stepTicks(state, 3);
    const park = Object.values(state.buildings).find((b) => b.type === "park");
    if (!park) throw new Error("park missing");
    // The opening's park carries the two unstaffed shops: removing it alone
    // would leave +2/tick and close admission 38 ticks later.
    const without = pollutionIfMothballed(state, park.id);
    expect(without?.net).toBe(2);
    expect(without?.blocksInTicks).toBe(38);
    // A park in a colony with no emitter is decoration: nothing to count down.
    const clean = pollutingColony();
    const wsId = Object.values(clean.buildings).find((b) => b.type === "workshop")?.id;
    if (!wsId) throw new Error("workshop missing");
    mustOk(applyCommand(clean, { kind: "setBuildingActive", id: wsId, active: false }));
    mustOk(applyCommand(clean, { kind: "placeBuilding", type: "park", x: 12, y: 12 }));
    stepTicks(clean, 3);
    const spare = Object.values(clean.buildings).find((b) => b.x === 12 && b.y === 12);
    if (!spare) throw new Error("park missing");
    expect(pollutionIfMothballed(clean, spare.id)?.blocksInTicks).toBeNull();
    // Unknown id: no claim at all.
    expect(pollutionIfMothballed(clean, "building-nope")).toBeNull();
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
