import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  SAVE_VERSION,
  parseSave,
  parseSaveString,
  saveToString,
  serialize,
  SaveValidationError,
} from "@/application/persistence/save.js";
import { mustOk } from "./helpers.js";

const CONFIG = {
  seed: "save-test",
  width: 16,
  height: 16,
  woodDeposits: [{ x: 3, y: 3, amount: 10 }],
  stoneDeposits: [{ x: 3, y: 10, amount: 8 }],
};

function richState(): GameState {
  const state = createInitialState(CONFIG);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(4, 2), cellKey(4, 3)] }));
  state.resources.water = 2;
  state.resources.planks = 5;
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 5, y: 3 }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 6, y: 3 }));
  stepTicks(state, 6);
  return state;
}

describe("save format", () => {
  it("exposes SAVE_VERSION 17 with the v13 migratable chain", () => {
    expect(SAVE_VERSION).toBe(17);
  });

  it("round-trips canonical state losslessly", () => {
    const state = richState();
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
  });

  it("round-trips through JSON text", () => {
    const state = richState();
    const restored = parseSaveString(saveToString(state));
    expect(restored).toEqual(state);
  });

  it("persisted mutated deposits, not seeds", () => {
    const state = richState();
    state.woodDeposits[cellKey(3, 3)] = { remaining: 4, capacity: 10 };
    const restored = parseSave(serialize(state));
    expect(restored.woodDeposits[cellKey(3, 3)]?.remaining).toBe(4);
  });

  it("serialize detaches deposit cells (doc mutation leaves state intact)", () => {
    const state = richState();
    const key = cellKey(3, 3);
    const before = state.woodDeposits[key]?.remaining;
    const doc = serialize(state);
    const cell = doc.deposits.wood[key];
    if (!cell) throw new Error("missing deposit cell in save doc");
    cell.remaining = (before ?? 0) + 999;
    expect(state.woodDeposits[key]?.remaining).toBe(before);
  });

  it("regenerates identical terrain from the seed (config-only persistence)", () => {
    const state = richState();
    const restored = parseSave(serialize(state));
    expect(restored.world).toEqual(state.world);
  });

  it("continues deterministically after load", () => {
    const state = richState();
    const restored = parseSave(serialize(state));
    stepTicks(state, 20);
    stepTicks(restored, 20);
    expect(restored).toEqual(state);
  });

  it("deterministic continuation survives a JSON text round-trip", () => {
    const state = richState();
    const restored = parseSaveString(saveToString(state));
    stepTicks(state, 12);
    stepTicks(restored, 12);
    expect(restored).toEqual(state);
  });

  // Tier1: inclusive bounds stay loadable — regression for the new guards.
  it("accepts a deposit at exactly remaining == capacity", () => {
    const state = richState();
    const key = cellKey(3, 3);
    const doc = serialize(state);
    const cell = doc.deposits.wood[key];
    if (!cell) throw new Error("missing deposit cell in save doc");
    cell.remaining = cell.capacity;
    const restored = parseSave(doc);
    expect(restored.woodDeposits[key]?.remaining).toBe(cell.capacity);
  });

  it("accepts pollution at both documented bounds (0 and 100)", () => {
    const state = richState();
    for (const pollution of [0, 100]) {
      const restored = parseSave({ ...serialize(state), pollution });
      expect(restored.pollution).toBe(pollution);
    }
  });
});

describe("save rejection (corrupt data never loads as valid)", () => {
  it("rejects wrong version", () => {
    const doc = serialize(richState());
    expect(() => parseSave({ ...doc, formatVersion: 12 })).toThrow(SaveValidationError);
  });

  it("rejects invalid JSON text", () => {
    expect(() => parseSaveString("{not json")).toThrow(SaveValidationError);
  });

  it("rejects negative resources", () => {
    const doc = serialize(richState());
    const resources = { ...doc.resources, money: -1 };
    expect(() => parseSave({ ...doc, resources })).toThrow(/resources\.money/);
  });

  it("rejects unknown building types", () => {
    const doc = serialize(richState());
    const buildings = [...doc.buildings, {
      id: "building-99",
      type: "teleporter",
      x: 1,
      y: 1,
      status: "operational",
      constructionTicksLeft: 0,
      staffed: false,
    }];
    expect(() => parseSave({ ...doc, buildings })).toThrow(/unknown building type/);
  });

  it("rejects a missing Colony Center anchor", () => {
    const doc = serialize(richState());
    const buildings = doc.buildings.filter((b) => b.id !== "colony-center");
    expect(() => parseSave({ ...doc, buildings })).toThrow(/Colony Center/);
  });

  it("rejects invalid cell keys in roads", () => {
    const doc = serialize(richState());
    const roads = [{ id: "road-x", cells: ["bogus"] }];
    expect(() => parseSave({ ...doc, roads })).toThrow(/invalid cell key/);
  });

  it("rejects negative deposit amounts", () => {
    const doc = serialize(richState());
    const deposits = { ...doc.deposits, wood: { [cellKey(3, 3)]: { remaining: -5 } } };
    expect(() => parseSave({ ...doc, deposits })).toThrow(/remaining/);
  });

  it("rejects non-integer tick", () => {
    const doc = serialize(richState());
    expect(() => parseSave({ ...doc, tick: 1.5 })).toThrow(/tick/);
  });

  // Tier1: deposit ceiling + pollution range are corrupt, not plausible state.
  it("rejects a deposit whose remaining exceeds its capacity", () => {
    const doc = serialize(richState());
    const key = cellKey(3, 3);
    const cell = doc.deposits.wood[key];
    if (!cell) throw new Error("missing deposit cell in save doc");
    const deposits = {
      ...doc.deposits,
      wood: { ...doc.deposits.wood, [key]: { ...cell, remaining: cell.capacity + 1 } },
    };
    expect(() => parseSave({ ...doc, deposits })).toThrow(/remaining exceeds capacity/);
  });

  it("rejects pollution above the documented maximum (100)", () => {
    const doc = serialize(richState());
    expect(() => parseSave({ ...doc, pollution: 101 })).toThrow(/pollution must be <= 100/);
  });

  it("rejects negative pollution (range floor is 0)", () => {
    const doc = serialize(richState());
    expect(() => parseSave({ ...doc, pollution: -1 })).toThrow(/pollution/);
  });
});
