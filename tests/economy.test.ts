import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import {
  COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK,
  MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK,
  TAX_PER_INHABITANT_PER_TICK,
  collectRevenue,
  connectedWorkshops,
  payMaintenance,
} from "../src/domain/economy/economy.js";
import { freeCell, mustOk } from "./helpers.js";

const CONFIG = { seed: "econ-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Operational connected workshop: road cell + adjacent workshop, matured. */
function placeConnectedWorkshop(state: GameState): void {
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const adj = [
    { x: road.x + 1, y: road.y },
    { x: road.x - 1, y: road.y },
    { x: road.x, y: road.y + 1 },
    { x: road.x, y: road.y - 1 },
  ].find(
    (c) =>
      c.x >= 0 && c.y >= 0 && c.x < state.world.width && c.y < state.world.height &&
      !state.world.blockedCells[cellKey(c.x, c.y)],
  );
  if (!adj) throw new Error("no adjacent free cell");
  state.resources.water = Math.max(state.resources.water, 1);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
  stepTicks(state, 2); // operational
}

describe("constants", () => {
  it("matches the validated Step001 baseline", () => {
    expect(TAX_PER_INHABITANT_PER_TICK).toBe(1);
    expect(COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK).toBe(2);
    expect(MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK).toBe(1);
  });
});

describe("revenue", () => {
  it("taxes scale with population", () => {
    const state = freshState();
    state.population = 5;
    const before = state.resources.money;
    expect(collectRevenue(state)).toEqual({ taxes: 5, commerce: 0, market: 0 });
    expect(state.resources.money).toBe(before + 5);
  });

  it("commerce follows road connection and ignores staffing (vacant still earns)", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    expect(connectedWorkshops(state)).toBe(1);
    expect(state.buildings["building-1"]?.staffed).toBe(false); // no colonists
    const before = state.resources.money;
    expect(collectRevenue(state)).toEqual({ taxes: 0, commerce: 2, market: 0 });
    expect(state.resources.money).toBe(before + 2);
  });

  it("unconnected or under-construction workshops earn no commerce", () => {
    const state = freshState();
    state.resources.water = 1;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 5, y: 5 }));
    expect(connectedWorkshops(state)).toBe(0); // under construction
    stepTicks(state, 2);
    expect(connectedWorkshops(state)).toBe(0); // operational but unconnected
  });
});

describe("maintenance", () => {
  it("charges 1 per operational building, roads excluded", () => {
    const state = freshState();
    placeConnectedWorkshop(state); // 1 workshop + roads
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 0, y: 1 }));
    stepTicks(state, 2); // residence operational too
    const operational = 2;
    const before = state.resources.money;
    expect(payMaintenance(state)).toBe(operational);
    expect(state.resources.money).toBe(before - operational);
  });

  it("clamps at zero: partial payment, never negative", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    state.resources.money = 0; // drained treasury
    payMaintenance(state);
    expect(state.resources.money).toBe(0); // never negative
  });

  it("under-construction buildings pay no maintenance", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 0, y: 1 }));
    const before = state.resources.money;
    expect(payMaintenance(state)).toBe(0);
    expect(state.resources.money).toBe(before);
  });
});

describe("full-tick economy", () => {
  it("revenue lands before maintenance in the same tick", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    state.population = 2;
    const before = state.resources.money;
    stepTicks(state, 1);
    // +2 taxes +2 commerce −1 maintenance (workshop is the only building)
    expect(state.resources.money).toBe(before + 3);
  });

  it("documented net-negative shape: village bleeds when maintenance outruns revenue", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    // test-level treasury injection: the D1 finding is that 5 operational
    // buildings are unfundable from the day-0 treasury in the first place
    state.resources.money = 300;
    for (let i = 0; i < 4; i++) {
      const spot = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
      stepTicks(state, 2);
    }
    state.population = 2;
    const before = state.resources.money;
    stepTicks(state, 1);
    // revenue 4 (2 taxes + 2 commerce) − maintenance 5 = −1/tick (D1 finding)
    expect(state.resources.money).toBe(before - 1);
  });

  it("economy is deterministic", () => {
    const a = freshState();
    const b = freshState();
    for (const s of [a, b]) {
      placeConnectedWorkshop(s);
      s.population = 3;
      stepTicks(s, 7);
    }
    expect(b).toEqual(a);
  });
});
