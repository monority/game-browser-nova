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
import { freeCell, mustOk } from "./helpers.js";

const CONFIG = { seed: "market-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

function adjacentFree(state: GameState, x: number, y: number): { x: number; y: number } {
  const adj = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].find(
    (c) =>
      c.x >= 0 && c.y >= 0 && c.x < state.world.width && c.y < state.world.height &&
      !state.world.blockedCells[cellKey(c.x, c.y)],
  );
  if (!adj) throw new Error("no adjacent free cell");
  return adj;
}

/** Operational road-connected market on an Age 2 state, matured. */
function placeConnectedMarket(state: GameState): void {
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
