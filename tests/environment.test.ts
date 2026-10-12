import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import {
  environmentalQuality,
  MIN_QUALITY_FOR_ADMISSION,
  ABSORPTION_PER_PARK_PER_TICK,
} from "../src/domain/environment/environment.js";
import { getAlerts } from "../src/application/queries/analysis.js";
import {
  parseSave,
  serialize,
  SAVE_VERSION,
  MIGRATABLE_SAVE_VERSION,
} from "../src/application/persistence/save.js";
import { freeCell, mustOk } from "./helpers.js";

const CONFIG = { seed: "env-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Matured connected workshop + residence (the polluting pair), pop 1. */
function pollutingColony(): GameState {
  const state = freshState();
  state.resources.money = 300;
  state.resources.water = 2;
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const candidates = [
    { x: road.x + 1, y: road.y },
    { x: road.x - 1, y: road.y },
    { x: road.x, y: road.y + 1 },
    { x: road.x, y: road.y - 1 },
  ];
  const spot = candidates.find(
    (c) =>
      c.x >= 0 && c.y >= 0 && c.x < state.world.width && c.y < state.world.height &&
      !state.world.blockedCells[cellKey(c.x, c.y)],
  );
  if (!spot) throw new Error("no adjacent free cell");
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
    stepTicks(state, 5);
    expect(state.pollution).toBe(0);
    expect(environmentalQuality(state)).toBe(100);
  });

  it("active workshop emits 1/tick; mothballed emits nothing", () => {
    const state = pollutingColony();
    // workshop operational during ticks 2 and 3 → 2 emitting ticks so far
    expect(state.pollution).toBe(2);
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

describe("environmental admission gate", () => {
  it("growth stops when quality < 25; bootstrap exemption still admits at pop 0", () => {
    const state = freshState();
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
  it("exposes SAVE_VERSION 16 with the v13 migratable chain", () => {
    expect(SAVE_VERSION).toBe(16);
    expect(MIGRATABLE_SAVE_VERSION).toBe(13);
  });

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
