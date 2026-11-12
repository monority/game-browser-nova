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
  it("honours the documented base contract, with no day-0 clamp", () => {
    expect([BASE_FOOD_CAPACITY, BASE_WATER_CAPACITY, FOOD_PER_WAREHOUSE, WATER_PER_WAREHOUSE])
      .toEqual([120, 80, 60, 40]);
    const state = freshState();
    expect(foodCapacity(state)).toBe(120);
    expect(waterCapacity(state)).toBe(80);
    // base caps double the D2 day-0 stocks (headroom, no day-0 clamp)
    expect(state.resources.food).toBeLessThanOrEqual(120);
    expect(state.resources.water).toBeLessThanOrEqual(80);
  });

  it("counts operational warehouses only, gates on planks, and reaches the stats surface", () => {
    const state = freshState();
    const id = placeWarehouse(state);
    expect(foodCapacity(state)).toBe(180);
    expect(waterCapacity(state)).toBe(120);
    expect(getColonyStats(state)).toMatchObject({ foodCapacity: 180, waterCapacity: 120 });

    mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: false }));
    expect(foodCapacity(state)).toBe(120);
    expect(waterCapacity(state)).toBe(80);

    const building = freshState();
    stripToAnchor(building);
    building.resources.money = 1000;
    building.resources.planks = 10;
    const spot = freeCell(building);
    mustOk(applyCommand(building, { kind: "placeBuilding", type: "warehouse", x: spot.x, y: spot.y }));
    expect(foodCapacity(building)).toBe(120); // under construction adds nothing

    const broke = freshState();
    stripToAnchor(broke);
    broke.resources.money = 1000;
    broke.resources.planks = 0;
    const other = freeCell(broke);
    expect(
      applyCommand(broke, { kind: "placeBuilding", type: "warehouse", x: other.x, y: other.y }).ok,
    ).toBe(false); // warehouse placement requires planks (industry gate)
  });

  it("discards overflow, clamps after consumption, and never exceeds capacity", () => {
    const overflow = freshState();
    stripToAnchor(overflow);
    overflow.resources.food = 300;
    overflow.resources.water = 300;
    expect(clampStorage(overflow)).toEqual({ foodWasted: 180, waterWasted: 220 });
    expect(overflow.resources).toMatchObject({ food: 120, water: 80 });

    const pinned = freshState();
    stripToAnchor(pinned);
    pinned.population = 0; // no consumption: pure production vs cap
    pinned.resources.food = 120;
    pinned.resources.water = 80;
    stepTicks(pinned, 1); // colony-center trickle +1, then clamp
    expect(pinned.resources).toMatchObject({ food: 120, water: 80 });

    const grown = freshState();
    stepTicks(grown, 50);
    expect(grown.resources.food).toBeLessThanOrEqual(foodCapacity(grown));
    expect(grown.resources.water).toBeLessThanOrEqual(waterCapacity(grown));
  });

  it("alerts on pinned stock with a positive balance, silent below the cap", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    state.resources.food = 120;
    expect(getAlerts(state).some((a) => a.message.startsWith("Food storage full"))).toBe(true);
    state.resources.food = 10;
    expect(getAlerts(state).some((a) => a.message.startsWith("Food storage full"))).toBe(false);
  });

  it("warehouse round-trips losslessly with no save migration", () => {
    const state = freshState();
    placeWarehouse(state);
    expect(parseSave(serialize(state))).toEqual(state);
  });
});
