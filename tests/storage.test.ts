import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { getColonyStats } from "@/application/queries/stats.js";
import { clampStorage, foodCapacity, waterCapacity } from "@/domain/storage/storage.js";
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
    // Step067: conservation takes 3 of the 121 units before the clamp, so the
    // granary settles below the cap instead of pinning. Water is unchanged
    // (no degradation) and still pins at 80.
    expect(pinned.resources).toMatchObject({ food: 118, water: 80 });

    const grown = freshState();
    stepTicks(grown, 50);
    expect(grown.resources.food).toBeLessThanOrEqual(foodCapacity(grown));
    expect(grown.resources.water).toBeLessThanOrEqual(waterCapacity(grown));
  });

});
