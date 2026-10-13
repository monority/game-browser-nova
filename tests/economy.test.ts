import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import {
  COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK,
  MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK,
  MIN_POP_FOR_COMMERCE,
  TAX_PER_INHABITANT_PER_TICK,
  collectRevenue,
  connectedWorkshops,
  payMaintenance,
} from "../src/domain/economy/economy.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "econ-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Isolated colony: D2 stripped away, then an operational connected workshop. */
function placeConnectedWorkshop(state: GameState): void {
  stripToAnchor(state);
  const road = freeCell(state);
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
  const adj = adjacentFree(state, road.x, road.y);
  state.resources.water = Math.max(state.resources.water, 1);
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
  stepTicks(state, 2); // operational
}

describe("constants", () => {
  it("matches the validated Step001 baseline plus the Step021 commerce gate", () => {
    expect(TAX_PER_INHABITANT_PER_TICK).toBe(1);
    expect(COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK).toBe(2);
    expect(MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK).toBe(1);
    expect(MIN_POP_FOR_COMMERCE).toBe(8);
  });
});

describe("revenue", () => {
  it("taxes scale with population", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 5;
    const before = state.resources.money;
    expect(collectRevenue(state)).toEqual({ taxes: 5, commerce: 0, market: 0 });
    expect(state.resources.money).toBe(before + 5);
  });

  it("base commerce floor is locked below pop 8, open at pop 8", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    state.population = 7;
    expect(collectRevenue(state)).toEqual({ taxes: 7, commerce: 0, market: 0 });
    state.population = 8;
    expect(collectRevenue(state)).toEqual({ taxes: 8, commerce: 2, market: 0 });
  });

  it("vacant workshops earn the base once unlocked (staffing-independent)", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.money = 1000;
    state.resources.water = 20;
    // 9 connected workshops, 8 colonists: 8 staffed, 1 vacant by construction
    for (let i = 0; i < 9; i++) {
      const road = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
      const adj = adjacentFree(state, road.x, road.y);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: adj.x, y: adj.y }));
    }
    stepTicks(state, 2);
    state.population = 8;
    stepTicks(state, 1); // staffing assigns 8 of 9
    const staffed = Object.values(state.buildings).filter((b) => b.staffed).length;
    expect(staffed).toBe(8);
    expect(connectedWorkshops(state)).toBe(9);
    // vacant earns: 9 x 2 base, no planks, no market
    expect(collectRevenue(state)).toEqual({ taxes: 8, commerce: 18, market: 0 });
  });

  it("unconnected or under-construction workshops earn no commerce", () => {
    const state = freshState();
    stripToAnchor(state);
    state.resources.water = 1;
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: spot.x, y: spot.y }));
    expect(connectedWorkshops(state)).toBe(0); // under construction
    stepTicks(state, 2);
    expect(connectedWorkshops(state)).toBe(0); // operational but unconnected
  });
});

describe("maintenance", () => {
  it("charges 1 per operational non-exempt building; residences are exempt", () => {
    const state = freshState();
    placeConnectedWorkshop(state); // 1 workshop + roads
    const home = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
    stepTicks(state, 2); // residence operational too
    const before = state.resources.money;
    // workshop pays, residence does not (Step021 housing-is-infrastructure)
    expect(payMaintenance(state)).toBe(1);
    expect(state.resources.money).toBe(before - 1);
  });

  it("a residence-only colony pays no maintenance", () => {
    const state = freshState();
    stripToAnchor(state);
    for (let i = 0; i < 3; i++) {
      const spot = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 2);
    const before = state.resources.money;
    expect(payMaintenance(state)).toBe(0);
    expect(state.resources.money).toBe(before);
  });

  it("residence spam cannot farm upkeep or income (exploit guard)", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    state.population = 8;
    state.resources.money = 500; // test-level funding for the spam itself
    stepTicks(state, 2);
    for (let i = 0; i < 5; i++) {
      const spot = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    }
    stepTicks(state, 3); // all operational
    // upkeep still 1 (workshop): residences are exempt, so spam is pure cost
    expect(payMaintenance(state)).toBe(1);
    const m0 = state.resources.money;
    stepTicks(state, 1);
    expect(state.resources.money).toBe(m0 + 9); // +8 taxes +2 commerce -1 upkeep
  });

  it("deactivate-reactivate cycling cannot double-earn commerce (exploit guard)", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    state.population = 8;
    const id = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "workshop");
    if (!id) throw new Error("workshop missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: false }));
    mustOk(applyCommand(state, { kind: "setBuildingActive", id, active: true }));
    // single revenue computation prices the active workshop exactly once
    expect(collectRevenue(state)).toEqual({ taxes: 8, commerce: 2, market: 0 });
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
    stripToAnchor(state);
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    const before = state.resources.money;
    expect(payMaintenance(state)).toBe(0);
    expect(state.resources.money).toBe(before);
  });
});

describe("full-tick economy", () => {
  it("revenue lands before maintenance in the same tick", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    state.population = 8; // unlocks the commerce floor
    const before = state.resources.money;
    stepTicks(state, 1);
    // +8 taxes +2 commerce -1 maintenance (workshop is the only upkeep building)
    expect(state.resources.money).toBe(before + 9);
  });

  it("net-negative shape persists for non-exempt compositions (D1 finding)", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    // test-level treasury injection for the unfundable composition
    state.resources.money = 300;
    for (let i = 0; i < 4; i++) {
      const spot = freeCell(state);
      mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: spot.x, y: spot.y }));
      stepTicks(state, 2);
    }
    state.population = 2;
    const before = state.resources.money;
    stepTicks(state, 1);
    // revenue 2 (2 taxes, commerce locked below pop 8) - maintenance 5
    // (workshop + 4 farms; residences would be exempt) = -3/tick
    expect(state.resources.money).toBe(before - 3);
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
