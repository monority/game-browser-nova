import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  LOGISTICS_DECAY_PER_CELL,
  LOGISTICS_FLOOR_PERCENT,
  LOGISTICS_FREE_RADIUS,
  WHEELBARROW_FREE_RADIUS_BONUS,
  buildLogisticsMap,
  logisticsDistance,
  logisticsEfficiencyPercent,
} from "@/domain/logistics/logistics.js";
import { mustOk, stripToAnchor } from "./helpers.js";

/**
 * Logistics efficiency contracts (Step050, scope calibrated by the
 * self-play guards): EXTRACTION worksites (lumber camp, quarry) scale
 * with road-graph distance to the nearest operational warehouse; farms,
 * wells and workshops are exempt until the V2 network-storage scope.
 */

const CONFIG = {
  seed: "logistics-test",
  width: 40,
  height: 16,
  woodDeposits: [
    { x: 13, y: 3, amount: 20 },
    { x: 14, y: 3, amount: 20 },
    { x: 21, y: 3, amount: 20 },
    { x: 24, y: 3, amount: 20 },
    { x: 30, y: 3, amount: 20 },
  ],
  stoneDeposits: [],
};

function freshState(): GameState {
  const state = createInitialState(CONFIG);
  // Subject under test is network distance, not terrain: clear the seeded
  // obstacles so the corridor geometry is exact.
  state.world.blockedCells = {};
  state.resources.money = 100000;
  state.resources.wood = 500;
  state.resources.stone = 500;
  state.resources.planks = 100;
  state.resources.water = 500;
  return state;
}

/**
 * Road corridor along y=2 (x = 0..to), warehouse at (0,1) adjacent to the
 * hub road cell (0,2). Camps sit at (x-1,3) or (x+1,3): adjacent to their
 * deposit at (x,3) AND to the road cell (x,2) — their network distance
 * equals the road x coordinate.
 */
function setupCorridor(state: GameState, to: number): void {
  stripToAnchor(state);
  mustOk(
    applyCommand(state, {
      kind: "placeRoads",
      cells: Array.from({ length: to + 1 }, (_, x) => cellKey(x, 2)),
    }),
  );
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "warehouse", x: 0, y: 1 }));
  stepTicks(state, 2); // the hub must be operational to seed the BFS
}

describe("logistics constants", () => {
  it("calibrated curve: free radius 12, decay 4, floor 60, wheelbarrow +6", () => {
    expect(LOGISTICS_FREE_RADIUS).toBe(12);
    expect(LOGISTICS_DECAY_PER_CELL).toBe(4);
    expect(LOGISTICS_FLOOR_PERCENT).toBe(60);
    expect(WHEELBARROW_FREE_RADIUS_BONUS).toBe(6);
  });
});

describe("distance and efficiency", () => {
  it("BFS follows the road graph from the warehouse", () => {
    const state = freshState();
    setupCorridor(state, 31);
    const map = buildLogisticsMap(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "lumberCamp", x: 12, y: 3 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "lumberCamp", x: 23, y: 3 }));
    const campNear = Object.values(state.buildings).find((b) => b.x === 12)!;
    const campFar = Object.values(state.buildings).find((b) => b.x === 23)!;
    expect(logisticsDistance(state, campNear, map)).toBe(12);
    expect(logisticsDistance(state, campFar, map)).toBe(23);
  });

  it("scales a camp's real extraction by its network position", () => {
    // The pure curve is pinned above; this pins the WIRING into phase 3 —
    // 23 hops = 100 − 11×4 → floor 60 → floor(2 × 0.6) = 1 wood/tick.
    const state = freshState();
    setupCorridor(state, 31);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "lumberCamp", x: 23, y: 3 }));
    state.population = Math.max(state.population, 1);
    state.resources.water = 500;
    state.resources.food = 100;
    stepTicks(state, 3); // operational, staffed, then one production tick
    const camp = Object.values(state.buildings).find((b) => b.type === "lumberCamp");
    expect(camp?.staffed).toBe(true);
    const wood = state.resources.wood;
    stepTicks(state, 1);
    expect(state.resources.wood - wood).toBe(1); // base 2 × 60 %, not the full 2
  });

  it("a disconnected road island floors (no path to a warehouse)", () => {
    const state = freshState();
    setupCorridor(state, 10);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(30, 8), cellKey(31, 8)] }));
    // camp on the island: adjacent to deposit (31,9)? — no deposit there;
    // use a manual placement-probe building instead of the placement command
    const island = state.buildings["colony-center"];
    void island;
    const map = buildLogisticsMap(state);
    expect(map.distance.get(cellKey(30, 8))).toBeUndefined();
    expect(logisticsEfficiencyPercent(state, {
      id: "probe", type: "lumberCamp", x: 30, y: 9,
      status: "operational", constructionTicksLeft: 0, staffed: true, active: true,
    }, map)).toBe(LOGISTICS_FLOOR_PERCENT);
  });

});

