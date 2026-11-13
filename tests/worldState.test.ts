import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { createWorld, isBlocked } from "@/domain/world/world.js";
import { addMoney } from "@/domain/resource/resource.js";

const CONFIG = { seed: "test-seed", width: 24, height: 24 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

describe("world generation (ADR-005)", () => {
  it("explicit blocked cells are honored and normalized/deduped", () => {
    // 4x4 → floor(16 * 0.06) = 0 seeded obstacles: only explicit cells exist.
    const world = createWorld({
      ...CONFIG,
      width: 4,
      height: 4,
      blockedCells: [cellKey(1, 1), cellKey(1, 1), cellKey(2, 2)],
    });
    expect(isBlocked(world, 1, 1)).toBe(true);
    expect(isBlocked(world, 2, 2)).toBe(true);
    expect(Object.keys(world.blockedCells).length).toBe(2);
  });

});

describe("canonical state", () => {
  it("day-0 ships the D2 colony: 10 pop, housing, producers, workshops", () => {
    const state = freshState();
    expect(state.population).toBe(10);
    const count = (t: string): number =>
      Object.values(state.buildings).filter((b) => b.type === t).length;
    expect(count("residence")).toBe(10);
    expect(count("farm")).toBe(5);
    expect(count("well")).toBe(5);
    expect(count("workshop")).toBe(2);
    // functioning colony: everything operational, workplaces road-adjacent
    for (const b of Object.values(state.buildings)) {
      expect(b.status).toBe("operational");
    }
  });

});

describe("fixed tick (ADR-002)", () => {
  it("simulation is deterministic: same state + ticks → same state", () => {
    const a = freshState();
    const b = freshState();
    stepTicks(a, 10);
    stepTicks(b, 10);
    expect(b).toEqual(a);
  });
});

describe("resource clamping", () => {
  it("addMoney never drives the treasury negative", () => {
    const state = freshState();
    state.resources.money = 3;
    addMoney(state.resources, -10);
    expect(state.resources.money).toBe(0);
    addMoney(state.resources, 7);
    expect(state.resources.money).toBe(7);
  });
});
