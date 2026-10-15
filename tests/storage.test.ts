import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { parseSave, serialize } from "@/application/persistence/save.js";
import { getAlerts } from "@/application/queries/analysis.js";
import { getColonyStats } from "@/application/queries/stats.js";
import {
  BASE_FOOD_CAPACITY,
  BASE_WATER_CAPACITY,
  FOOD_PER_WAREHOUSE,
  WATER_PER_WAREHOUSE,
  clampStorage,
  foodCapacity,
  waterCapacity,
} from "@/domain/storage/storage.js";
import { freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "storage-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Funded isolated colony, then an operational warehouse (2-tick build). */
function placeWarehouse(state: GameState): string {
  stripToAnchor(state);
  state.resources.money = 1000;
  state.resources.planks = 10;
  const spot = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "warehouse", x: spot.x, y: spot.y }));
  stepTicks(state, 2);
  const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "warehouse");
  if (!id) throw new Error("warehouse missing");
  return id;
}

describe("storage capacity (Step031)", () => {
  it("constants match the documented contract", () => {
    expect(BASE_FOOD_CAPACITY).toBe(120);
    expect(BASE_WATER_CAPACITY).toBe(80);
    expect(FOOD_PER_WAREHOUSE).toBe(60);
    expect(WATER_PER_WAREHOUSE).toBe(40);
  });

  it("base caps double the D2 day-0 stocks (headroom, no day-0 clamp)", () => {
    const state = freshState();
    expect(foodCapacity(state)).toBe(120);
    expect(waterCapacity(state)).toBe(80);
    expect(state.resources.food).toBeLessThanOrEqual(120);
    expect(state.resources.water).toBeLessThanOrEqual(80);
  });

  it("each operational warehouse adds one day-0 stock (60/40)", () => {
    const state = freshState();
    placeWarehouse(state);
    expect(foodCapacity(state)).toBe(180);
    expect(waterCapacity(state)).toBe(120);
  });

  it("under-construction warehouse adds nothing", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.money = 1000;
    state.resources.planks = 10;
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "warehouse", x: spot.x, y: spot.y }));
    expect(foodCapacity(state)).toBe(120);
  });

  it("mothballed warehouse removes its capacity", () => {
    const state = freshState();
    const id = placeWarehouse(state);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: false }));
    expect(foodCapacity(state)).toBe(120);
    expect(waterCapacity(state)).toBe(80);
  });

  it("warehouse placement requires planks (industry gate)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.money = 1000;
    state.resources.planks = 0;
    const spot = freeCell(state);
    const result = applyCommand(state, { kind: "placeBuilding", type: "warehouse", x: spot.x, y: spot.y });
    expect(result.ok).toBe(false);
  });

  it("clamp discards overflow above capacity", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.food = 300;
    state.resources.water = 300;
    const wasted = clampStorage(state);
    expect(state.resources.food).toBe(120);
    expect(state.resources.water).toBe(80);
    expect(wasted.foodWasted).toBe(180);
    expect(wasted.waterWasted).toBe(220);
  });

  it("tick clamps after consumption (true surplus wasted, colonists eat first)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0; // no consumption: pure production vs cap
    state.resources.food = 120; // pinned at base cap
    state.resources.water = 80;
    stepTicks(state, 1); // colony-center trickle +1, then clamp
    expect(state.resources.food).toBe(120);
    expect(state.resources.water).toBe(80);
  });

  it("stock never exceeds capacity across ticks", () => {
    const state = freshState();
    stepTicks(state, 50);
    expect(state.resources.food).toBeLessThanOrEqual(foodCapacity(state));
    expect(state.resources.water).toBeLessThanOrEqual(waterCapacity(state));
  });

  it("storage-full alert fires on pinned stock with positive balance, silent below cap", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.food = 120;
    const alerts = getAlerts(state).map((a) => a.message);
    expect(alerts.some((m) => m.startsWith("Food storage full"))).toBe(true);
    state.resources.food = 10;
    const quiet = getAlerts(state).map((a) => a.message);
    expect(quiet.some((m) => m.startsWith("Food storage full"))).toBe(false);
  });

  it("stats expose derived caps", () => {
    const state = freshState();
    placeWarehouse(state);
    const stats = getColonyStats(state);
    expect(stats.foodCapacity).toBe(180);
    expect(stats.waterCapacity).toBe(120);
  });

  it("warehouse round-trips losslessly with no save migration", () => {
    const state = freshState();
    placeWarehouse(state);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
  });
});
