import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import {
  FOOD_SOLD_PER_MARKET_PER_TICK,
  MONEY_PER_FOOD_SOLD,
  collectRevenue,
  connectedMarkets,
  expectedMarketSales,
  sellMarketSurplus,
} from "../src/domain/economy/economy.js";
import { getColonyStats } from "../src/application/queries/stats.js";
import { getResourceSummaries } from "../src/application/queries/analysis.js";
import { parseSave, serialize, SAVE_VERSION } from "../src/application/persistence/save.js";
import { BUILDING_PALETTE, createBuildingMeshes } from "../src/renderer/shapes.js";
import { adjacentFree, freeCell, mustOk, neighborsOf, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "market-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}


/** Operational road-connected market on an Age 2 state, matured. */
function placeConnectedMarket(state: GameState): void {
  stripToAnchor(state);
  state.population = 0;
  state.age = 2;
  state.resources.money = Math.max(state.resources.money, 500);
  state.resources.planks = Math.max(state.resources.planks, 10);
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const adj = adjacentFree(state, road.x, road.y);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "market", x: adj.x, y: adj.y }));
  stepTicks(state, 2); // operational
}

function placeConnectedFarm(state: GameState): void {
  // no strip here: callers that need a market strip once via placeConnectedMarket
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const adj = adjacentFree(state, road.x, road.y);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: adj.x, y: adj.y }));
  stepTicks(state, 2); // operational
}

describe("market constants", () => {
  it("sells 2 food per market per tick at 1 money each", () => {
    expect(FOOD_SOLD_PER_MARKET_PER_TICK).toBe(2);
    expect(MONEY_PER_FOOD_SOLD).toBe(1);
  });
});

describe("market placement gate", () => {
  it("is age-locked in Age 1 and unlocks in Age 2", () => {
    const state = freshState();
    state.resources.money = 500;
    state.resources.planks = 10;
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const adj = adjacentFree(state, road.x, road.y);
    const before = state.resources.money;
    expect(applyCommand(state, { kind: "placeBuilding", type: "market", x: adj.x, y: adj.y })).toEqual({
      ok: false,
      reason: "ageLocked",
    });
    expect(state.resources.money).toBe(before); // rejected commands charge nothing
    state.age = 2;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "market", x: adj.x, y: adj.y }));
    expect(state.resources.money).toBe(before - 50);
    expect(state.resources.planks).toBe(10 - 2);
  });
});

describe("market surplus sales", () => {
  it("sells post-consumption leftovers: +2 money, -2 food, maintenance still due", () => {
    const state = freshState();
    placeConnectedMarket(state);
    placeConnectedFarm(state);
    state.population = 1;
    stepTicks(state, 2); // farm staffed at end of tick 2
    state.resources.food = 10;
    const moneyBefore = state.resources.money;
    stepTicks(state, 1);
    // production 3 (farm 2 + trickle 1), consumption 1, sales 2, maintenance 2 (farm + market)
    // money: +1 tax +2 market -2 maintenance = +1; food: 10 + 3 - 1 - 2 = 10
    expect(state.resources.money).toBe(moneyBefore + 1);
    expect(state.resources.food).toBe(10);
    expect(connectedMarkets(state)).toBe(1);
  });

  it("sells nothing when the colony is starving", () => {
    const state = freshState();
    placeConnectedMarket(state);
    state.population = 5; // no farms: trickle alone cannot feed 5
    state.resources.food = 0;
    const result = collectRevenue(state);
    expect(result.market).toBe(0);
    expect(expectedMarketSales(state)).toBe(0);
    expect(sellMarketSurplus(state)).toBe(0);
  });

  it("mothballed or unconnected markets sell nothing", () => {
    const state = freshState();
    placeConnectedMarket(state);
    const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "market");
    if (!id) throw new Error("market missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: false }));
    expect(connectedMarkets(state)).toBe(0);
    expect(expectedMarketSales(state)).toBe(0);
  });
});

describe("market stats and forecast", () => {
  it("stats report market income and honest commerce", () => {
    const state = freshState();
    placeConnectedMarket(state);
    placeConnectedFarm(state);
    state.population = 1;
    stepTicks(state, 2);
    state.resources.food = 10;
    const stats = getColonyStats(state);
    expect(stats.connectedMarkets).toBe(1);
    expect(stats.marketPerTick).toBe(2);
    expect(stats.revenuePerTick).toBe(1 + 0 + 2); // taxes + commerce + market
    expect(stats.netMoneyPerTick).toBe(3 - 2); // maintenance: farm + market
  });

  it("food forecast balance shows the market drain", () => {
    const state = freshState();
    placeConnectedMarket(state);
    placeConnectedFarm(state);
    state.population = 1;
    stepTicks(state, 2);
    state.resources.food = 10;
    const summaries = getResourceSummaries(state);
    expect(summaries.food.productionPerTick).toBe(3);
    expect(summaries.food.consumptionPerTick).toBe(1);
    expect(summaries.food.balancePerTick).toBe(0); // 3 - 1 - 2 market drain
  });
});

describe("market persistence and rendering", () => {
  it("round-trips markets without a save version bump", () => {
    expect(SAVE_VERSION).toBe(17);
    const state = freshState();
    placeConnectedMarket(state);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(connectedMarkets(restored)).toBe(1);
  });

  it("has a distinct stall silhouette", () => {
    const group = createBuildingMeshes("market", BUILDING_PALETTE.market);
    expect(group.children.length).toBeGreaterThan(3); // counter + awning stripes + poles
  });

  it("organic wood chain: triage staffing produces wood, then planks (Step022)", () => {
    // No project mode, no state manipulation: D2 start, player commands only.
    // A late-built camp sorts last, so with 10 workers and 13 eligible
    // workplaces it starves. Mothballing earlier-sorting workplaces frees
    // workers deterministically (staffing overlay shows who is staffed).
    const state = createInitialState({
      seed: "step022-woodchain",
      width: 16,
      height: 16,
      woodDeposits: [{ x: 5, y: 5, amount: 60 }],
    });
    const buildable = (state: GameState, x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= state.world.width || y >= state.world.height) return false;
      const key = cellKey(x, y);
      if (state.world.blockedCells[key]) return false;
      if (state.woodDeposits[key] || state.stoneDeposits[key]) return false;
      return !Object.values(state.buildings).some((b) => b.x === x && b.y === y);
    };
    // Player-plausible placement: first buildable cell by a deposit (the
    // deposits overlay leads the eye), road beside it, in canonical scan.
    let campId = "";
    for (const key of Object.keys(state.woodDeposits).sort()) {
      const parts = key.split(",").map(Number);
      const dx = parts[0] ?? 0;
      const dy = parts[1] ?? 0;
      for (const n of neighborsOf(dx, dy)) {
        if (!buildable(state, n.x, n.y)) continue;
        const road = neighborsOf(n.x, n.y).find(
          (c) => !(c.x === n.x && c.y === n.y) && buildable(state, c.x, c.y),
        );
        if (!road) continue;
        mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
        const r = applyCommand(state, { kind: "placeBuilding", type: "lumberCamp", x: n.x, y: n.y });
        mustOk(r);
        campId = `building-${state.buildingCounter - 1}`;
        break;
      }
      if (campId) break;
    }
    if (!campId) throw new Error("no camp site by the deposit");
    stepTicks(state, 2); // camp operational
    // Blocker reproduced: camp sorts last, workers run out first.
    stepTicks(state, 30);
    expect(state.buildings[campId]?.staffed).toBe(false);
    expect(state.resources.wood).toBe(0);
    // Triage with buffers to survive the project window (D2 stocks).
    expect(state.resources.food).toBeGreaterThan(20);
    expect(state.resources.water).toBeGreaterThan(10);
    const firstOf = (t: string): string => {
      const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === t);
      if (!id) throw new Error(`no ${t}`);
      return id;
    };
    // Rest one farm, one well and one shop: eligible drops to workers, so
    // the last-sorting camp is staffed deterministically, while the other
    // shop stays staffed and transforms each batch the same tick it lands.
    // Drains are slow (food -1/tick, water -2/tick) against the buffers.
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: firstOf("farm"), active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: firstOf("well"), active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: firstOf("workshop"), active: false }));
    stepTicks(state, 8);
    expect(state.buildings[campId]?.staffed).toBe(true);
    expect(state.resources.planks).toBeGreaterThanOrEqual(4);
    expect(state.population).toBe(10); // buffers held, no wipe
  });

  it("market economy is deterministic", () => {
    const a = freshState();
    const b = freshState();
    for (const s of [a, b]) {
      placeConnectedMarket(s);
      placeConnectedFarm(s);
      s.population = 1;
      stepTicks(s, 6);
    }
    expect(b).toEqual(a);
  });
});
