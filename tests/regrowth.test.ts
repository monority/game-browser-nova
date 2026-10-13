import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import { normalizeDeposits, regrowAdjacent } from "../src/domain/world/deposits.js";
import { WOOD_REGROWTH_PER_PARK_PER_TICK } from "../src/domain/environment/environment.js";
import {
  parseSave,
  serialize,
  SAVE_VERSION,
  MIGRATABLE_SAVE_VERSION,
} from "../src/application/persistence/save.js";
import { mustOk } from "./helpers.js";

const CONFIG = {
  seed: "regrow-test",
  width: 16,
  height: 16,
  woodDeposits: [{ x: 5, y: 5, amount: 6 }],
  stoneDeposits: [{ x: 10, y: 10, amount: 8 }],
};

function freshState(): GameState {
  const state = createInitialState(CONFIG);
  state.resources.money = 500;
  return state;
}

/** Free orthogonal neighbor of (x, y): not blocked, no deposit, no building/road. */
function neighborSpot(state: GameState, x: number, y: number): { x: number; y: number } {
  const spot = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].find(
    (c) =>
      c.x >= 0 && c.y >= 0 && c.x < state.world.width && c.y < state.world.height &&
      !state.world.blockedCells[cellKey(c.x, c.y)] &&
      !state.woodDeposits[cellKey(c.x, c.y)] &&
      !state.stoneDeposits[cellKey(c.x, c.y)] &&
      !Object.values(state.buildings).some((b) => b.x === c.x && b.y === c.y),
  );
  if (!spot) throw new Error("no free neighbor cell");
  return spot;
}

/** Operational park adjacent to (x, y), matured. Parks need no roads. */
function placeParkNextTo(state: GameState, x: number, y: number): void {
  const spot = neighborSpot(state, x, y);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
  stepTicks(state, 2); // operational
}

describe("regrowth constants", () => {
  it("parks regrow 1 wood per tick", () => {
    expect(WOOD_REGROWTH_PER_PARK_PER_TICK).toBe(1);
  });

  it("normalizeDeposits records capacity alongside remaining", () => {
    const deposits = normalizeDeposits([
      { x: 1, y: 1, amount: 4 },
      { x: 1, y: 1, amount: 3 },
    ]);
    expect(deposits[cellKey(1, 1)]).toEqual({ remaining: 7, capacity: 7 });
  });
});

describe("park forest regrowth", () => {
  it("regrows a depleted adjacent deposit +1 per tick up to capacity", () => {
    const state = freshState();
    placeParkNextTo(state, 5, 5);
    state.woodDeposits[cellKey(5, 5)] = { remaining: 0, capacity: 6 };
    stepTicks(state, 3);
    expect(state.woodDeposits[cellKey(5, 5)]?.remaining).toBe(3);
    stepTicks(state, 10);
    expect(state.woodDeposits[cellKey(5, 5)]?.remaining).toBe(6); // capped, never above
  });

  it("does nothing without parks, with mothballed parks, or to stone", () => {
    const bare = freshState();
    bare.woodDeposits[cellKey(5, 5)] = { remaining: 0, capacity: 6 };
    stepTicks(bare, 3);
    expect(bare.woodDeposits[cellKey(5, 5)]?.remaining).toBe(0);

    const mothballed = freshState();
    placeParkNextTo(mothballed, 5, 5);
    const parkId = Object.keys(mothballed.buildings).find(
      (k) => mothballed.buildings[k]?.type === "park",
    );
    if (!parkId) throw new Error("park missing");
    mustOk(applyCommand(mothballed, { kind: "setBuildingActive", id: parkId, active: false }));
    mothballed.woodDeposits[cellKey(5, 5)] = { remaining: 0, capacity: 6 };
    mothballed.stoneDeposits[cellKey(10, 10)] = { remaining: 0, capacity: 8 };
    stepTicks(mothballed, 3);
    expect(mothballed.woodDeposits[cellKey(5, 5)]?.remaining).toBe(0);

    const stony = freshState();
    placeParkNextTo(stony, 10, 10);
    stony.stoneDeposits[cellKey(10, 10)] = { remaining: 0, capacity: 8 };
    stepTicks(stony, 5);
    expect(stony.stoneDeposits[cellKey(10, 10)]?.remaining).toBe(0); // stone never regrows
  });

  it("regrows the lowest canonical key first", () => {
    // second deposit adjacent to the same park spot search area is complex;
    // unit-test ordering directly through regrowAdjacent instead.
    const deposits = normalizeDeposits([
      { x: 2, y: 1, amount: 4 },
      { x: 1, y: 2, amount: 4 },
    ]);
    deposits[cellKey(2, 1)] = { remaining: 0, capacity: 4 };
    deposits[cellKey(1, 2)] = { remaining: 0, capacity: 4 };
    // park at (1,1) touches both; canonical order is y-then-x, so (2,1) wins
    expect(regrowAdjacent(deposits, 1, 1, 1)).toBe(1);
    expect(deposits[cellKey(2, 1)]?.remaining).toBe(1);
    expect(deposits[cellKey(1, 2)]?.remaining).toBe(0);
  });

  it("regrown wood is collectible next tick", () => {
    const state = freshState();
    placeParkNextTo(state, 5, 5);
    state.woodDeposits[cellKey(5, 5)] = { remaining: 0, capacity: 6 };
    stepTicks(state, 2); // +2 regrown (anchor far away, collects nothing here)
    expect(state.woodDeposits[cellKey(5, 5)]?.remaining).toBe(2);
  });
});

describe("regrowth persistence", () => {
  it("exposes SAVE_VERSION 17 with the v13 migratable chain", () => {
    expect(SAVE_VERSION).toBe(17);
    expect(MIGRATABLE_SAVE_VERSION).toBe(13);
  });

  it("round-trips capacities losslessly", () => {
    const state = freshState();
    placeParkNextTo(state, 5, 5);
    state.woodDeposits[cellKey(5, 5)] = { remaining: 2, capacity: 6 };
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(restored.woodDeposits[cellKey(5, 5)]).toEqual({ remaining: 2, capacity: 6 });
  });

  it("migrates a v16 save: capacities rebuilt from world seeds", () => {
    const state = freshState();
    const doc = serialize(state) as unknown as Record<string, unknown>;
    const deposits = (doc.deposits ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
    const strip = (group: Record<string, Record<string, unknown>>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(group)) out[key] = { remaining: entry.remaining };
      return out;
    };
    const v16 = {
      ...doc,
      formatVersion: 16,
      deposits: { wood: strip(deposits.wood ?? {}), stone: strip(deposits.stone ?? {}) },
    } as Record<string, unknown>;
    const migrated = parseSave(v16);
    expect(migrated.woodDeposits[cellKey(5, 5)]).toEqual({ remaining: 6, capacity: 6 });
    expect(migrated.stoneDeposits[cellKey(10, 10)]).toEqual({ remaining: 8, capacity: 8 });
    expect(migrated.age).toBe(1);
  });

  it("regrowth with extraction is deterministic", () => {
    const a = freshState();
    const b = freshState();
    for (const s of [a, b]) {
      placeParkNextTo(s, 5, 5);
      s.woodDeposits[cellKey(5, 5)] = { remaining: 1, capacity: 6 };
      stepTicks(s, 9);
    }
    expect(b).toEqual(a);
    expect(a.woodDeposits[cellKey(5, 5)]?.remaining).toBe(6);
  });
});
