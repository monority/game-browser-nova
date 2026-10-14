import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { stepSimulation, stepTicks } from "../src/domain/simulation/tick.js";
import { createWorld, isBlocked } from "../src/domain/world/world.js";
import {
  addMoney,
  deductFood,
  INITIAL_TREASURY,
} from "../src/domain/resource/resource.js";

const CONFIG = { seed: "test-seed", width: 24, height: 24 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

describe("world generation (ADR-005)", () => {
  it("same seed and parameters produce an identical world", () => {
    const a = createWorld(CONFIG);
    const b = createWorld(CONFIG);
    expect(b).toEqual(a);
  });

  it("different seeds usually produce different terrain", () => {
    const a = createWorld({ ...CONFIG, seed: "alpha" });
    const b = createWorld({ ...CONFIG, seed: "beta" });
    expect(a.blockedCells).not.toEqual(b.blockedCells);
  });

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

  it("out-of-bounds blocked cells are rejected", () => {
    expect(() => createWorld({ ...CONFIG, blockedCells: [cellKey(99, 99)] })).toThrow();
  });

  it("invalid dimensions are rejected", () => {
    expect(() => createWorld({ ...CONFIG, width: 0 })).toThrow();
    expect(() => createWorld({ ...CONFIG, height: -1 })).toThrow();
  });

  it("seeded obstacles stay in bounds", () => {
    const world = createWorld(CONFIG);
    for (const key of Object.keys(world.blockedCells)) {
      const [x, y] = key.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(world.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(world.height);
    }
  });
});

describe("canonical state", () => {
  it("day-0 stock matches the documented baseline", () => {
    const state = freshState();
    expect(state.resources.money).toBe(INITIAL_TREASURY);
    expect(state.resources.money).toBe(100);
    // D2 day-0 colony (Step021): tight but sufficient operating stocks
    expect(state.resources.food).toBe(60);
    expect(state.resources.water).toBe(40);
  });

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

  it("starts at tick 0 with a generated world", () => {
    const state = freshState();
    expect(state.tick).toBe(0);
    expect(state.world.width).toBe(24);
    expect(state.world.height).toBe(24);
  });
});

describe("fixed tick (ADR-002)", () => {
  it("tick is monotonic and advances one per step", () => {
    const state = freshState();
    stepTicks(state, 5);
    expect(state.tick).toBe(5);
    stepSimulation(state);
    expect(state.tick).toBe(6);
  });

  it("simulation is deterministic: same state + ticks → same state", () => {
    const a = freshState();
    const b = freshState();
    stepTicks(a, 10);
    stepTicks(b, 10);
    expect(b).toEqual(a);
  });
});

describe("resource clamping", () => {
  it("deductFood returns the amount actually taken and clamps at zero", () => {
    const state = freshState();
    state.resources.food = 5;
    expect(deductFood(state.resources, 3)).toBe(3);
    expect(state.resources.food).toBe(2);
    expect(deductFood(state.resources, 10)).toBe(2);
    expect(state.resources.food).toBe(0);
  });

  it("addMoney never drives the treasury negative", () => {
    const state = freshState();
    state.resources.money = 3;
    addMoney(state.resources, -10);
    expect(state.resources.money).toBe(0);
    addMoney(state.resources, 7);
    expect(state.resources.money).toBe(7);
  });
});
