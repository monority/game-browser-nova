import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { parseSave, serialize, SaveValidationError } from "@/application/persistence/save.js";
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

});

describe("regrowth persistence", () => {
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

  it("rejects a v16 save with corrupt deposits instead of healing them as empty", () => {
    const state = freshState();
    const doc = serialize(state) as unknown as Record<string, unknown>;
    const v16 = {
      ...doc,
      formatVersion: 16,
      deposits: { wood: null, stone: {} },
    } as Record<string, unknown>;
    expect(() => parseSave(v16)).toThrow(SaveValidationError);
  });

});
