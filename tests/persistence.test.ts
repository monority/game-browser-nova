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

function mutating(
  state: GameState,
  edit: (doc: ReturnType<typeof serialize>) => void,
): unknown {
  const doc = serialize(state);
  edit(doc);
  return doc;
}

describe("save format", () => {
  it("is SAVE_VERSION 18", () => {
    expect(SAVE_VERSION).toBe(18);
  });

  it("round-trips the canonical state losslessly, through JSON text too", () => {
    const state = richState();
    expect(parseSave(serialize(state))).toEqual(state);
    expect(parseSaveString(saveToString(state))).toEqual(state);
  });

  it("persists mutated deposits (not seeds) and never aliases them", () => {
    const state = richState();
    const key = cellKey(3, 3);
    state.woodDeposits[key] = { remaining: 4, capacity: 10 };
    const doc = serialize(state);
    const cell = doc.deposits.wood[key];
    if (!cell) throw new Error("missing deposit cell in save doc");
    cell.remaining = 999; // mutating the document must leave the state alone
    expect(state.woodDeposits[key]?.remaining).toBe(4);
    expect(parseSave(serialize(state)).woodDeposits[key]?.remaining).toBe(4);
  });

  it("continues deterministically after load", () => {
    const state = richState();
    const fromDoc = parseSave(serialize(state));
    const fromText = parseSaveString(saveToString(state));
    stepTicks(state, 20);
    stepTicks(fromDoc, 20);
    stepTicks(fromText, 20);
    expect(fromDoc).toEqual(state);
    expect(fromText).toEqual(state);
  });

  it("accepts the documented inclusive bounds", () => {
    const state = richState();
    const key = cellKey(3, 3);
    const atCapacity = mutating(state, (doc) => {
      const cell = doc.deposits.wood[key];
      if (!cell) throw new Error("missing deposit cell in save doc");
      cell.remaining = cell.capacity;
    });
    expect(parseSave(atCapacity).woodDeposits[key]?.remaining).toBe(10);
    for (const pollution of [0, 100]) {
      expect(parseSave({ ...serialize(state), pollution }).pollution).toBe(pollution);
    }
  });
});

describe("save rejection (corrupt data never loads as valid)", () => {
  const state = richState();

  it("rejects every malformed document with its own diagnosis", () => {
    const doc = serialize(state);
    const road = doc.roads[0];
    if (!road) throw new Error("road missing");
    const center = doc.buildings.find((b) => b.id === "colony-center");
    if (!center) throw new Error("center missing");
    const workshop = doc.buildings.find((b) => b.type === "workshop");
    if (!workshop) throw new Error("workshop missing");
    const relocateResidence = (x: number, y: number) =>
      doc.buildings.map((b) => (b.type === "residence" ? { ...b, x, y } : b));

    const cases: { name: string; doc: unknown; error: RegExp }[] = [
      { name: "wrong version", doc: { ...doc, formatVersion: 12 }, error: /unsupported save version/ },
      { name: "invalid JSON text", doc: "{not json", error: /JSON/ },
      {
        name: "negative resources",
        doc: { ...doc, resources: { ...doc.resources, money: -1 } },
        error: /resources\.money/,
      },
      {
        name: "unknown building type",
        doc: {
          ...doc,
          buildings: [
            ...doc.buildings,
            { id: "building-99", type: "teleporter", x: 1, y: 1, status: "operational", constructionTicksLeft: 0, staffed: false },
          ],
        },
        error: /unknown building type/,
      },
      {
        name: "missing Colony Center",
        doc: { ...doc, buildings: doc.buildings.filter((b) => b.id !== "colony-center") },
        error: /Colony Center/,
      },
      {
        name: "invalid cell key",
        doc: { ...doc, roads: [{ id: "road-x", cells: ["bogus"] }] },
        error: /invalid cell key/,
      },
      {
        name: "negative deposit",
        doc: { ...doc, deposits: { ...doc.deposits, wood: { [cellKey(3, 3)]: { remaining: -5 } } } },
        error: /remaining/,
      },
      { name: "non-integer tick", doc: { ...doc, tick: 1.5 }, error: /integer/ },
      {
        name: "deposit above capacity",
        doc: mutating(state, (d) => {
          const cell = d.deposits.wood[cellKey(3, 3)];
          if (!cell) throw new Error("missing deposit cell in save doc");
          cell.remaining = cell.capacity + 1;
        }),
        error: /remaining exceeds capacity/,
      },
      { name: "pollution above 100", doc: { ...doc, pollution: 101 }, error: /pollution/ },
      { name: "negative pollution", doc: { ...doc, pollution: -1 }, error: /pollution/ },
      { name: "building out of bounds", doc: { ...doc, buildings: relocateResidence(doc.world.width, 0) }, error: /out of bounds/ },
      {
        name: "two buildings on one cell",
        doc: { ...doc, buildings: relocateResidence(workshop.x, workshop.y) },
        error: /same cell/,
      },
      { name: "building on a deposit", doc: { ...doc, buildings: relocateResidence(3, 3) }, error: /deposit/ },
      { name: "construction state inconsistent", doc: { ...doc, buildings: doc.buildings.map((b) => (b.type === "residence" ? { ...b, constructionTicksLeft: 1 } : b)) }, error: /construction time/ },
      {
        name: "road out of bounds",
        doc: { ...doc, roads: [{ ...road, cells: [`${doc.world.width},0`] }] },
        error: /out of bounds/,
      },
      {
        name: "duplicate road cell",
        doc: { ...doc, roads: [...doc.roads, { id: "road-99", cells: [road.cells[0] ?? "0,0"] }] },
        error: /duplicate road cell/,
      },
      {
        name: "road over a building",
        doc: { ...doc, roads: [{ id: "road-99", cells: [cellKey(center.x, center.y)] }] },
        error: /overlaps a building/,
      },
      {
        name: "deposit seed out of bounds",
        doc: { ...doc, world: { ...doc.world, woodDeposits: [{ x: 99, y: 0, amount: 1 }] } },
        error: /out of bounds/,
      },
      {
        name: "blocked cell out of bounds",
        doc: { ...doc, world: { ...doc.world, blockedCells: ["99,0"] } },
        error: /out of bounds/,
      },
      {
        name: "persisted deposit out of bounds",
        doc: { ...doc, deposits: { ...doc.deposits, wood: { "99,0": { remaining: 1, capacity: 1 } } } },
        error: /out-of-bounds cell/,
      },
    ];

    for (const { name, doc: corrupt, error } of cases) {
      const load = () => (typeof corrupt === "string" ? parseSaveString(corrupt) : parseSave(corrupt));
      expect(load, name).toThrow(SaveValidationError);
      expect(load, name).toThrow(error);
    }
  });

  it("rejects a building on a blocked terrain cell", () => {
    const blockKey = Object.keys(state.world.blockedCells).find(
      (cell) => !serialize(state).buildings.some((b) => cellKey(b.x, b.y) === cell),
    );
    if (!blockKey) throw new Error("no free blocked cell");
    const { x, y } = { x: Number(blockKey.split(",")[0]), y: Number(blockKey.split(",")[1]) };
    expect(() =>
      parseSave(mutating(state, (doc) => {
        doc.buildings = doc.buildings.map((b) => (b.type === "residence" ? { ...b, x, y } : b));
      })),
    ).toThrow(/blocked cell/);
  });
});
