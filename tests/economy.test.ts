import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import type { GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK,
  MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK,
  MIN_POP_FOR_COMMERCE,
  TAX_PER_INHABITANT_PER_TICK,
  collectRevenue,
  payMaintenance,
} from "@/domain/economy/economy.js";
import { adjacentFree, freeCell, mustOk, stripToAnchor , stockedState} from "./helpers.js";

const CONFIG = { seed: "econ-test", width: 16, height: 16 };

function freshState(): GameState {
  return stockedState(CONFIG);
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

describe("revenue", () => {
  it("matches the validated Step001 baseline plus the Step021 commerce gate", () => {
    expect([
      TAX_PER_INHABITANT_PER_TICK,
      COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK,
      MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK,
      MIN_POP_FOR_COMMERCE,
    ]).toEqual([1, 2, 1, 8]);

    const taxing = freshState();
    stripToAnchor(taxing);
    taxing.population = 5;
    const before = taxing.resources.money;
    expect(collectRevenue(taxing)).toEqual({ taxes: 5, commerce: 0 });
    expect(taxing.resources.money).toBe(before + 5);
  });

  it("locks the base commerce floor below pop 8 and opens it at 8", () => {
    const state = freshState();
    placeConnectedWorkshop(state);
    state.population = 7;
    expect(collectRevenue(state)).toEqual({ taxes: 7, commerce: 0 });
    state.population = 8;
    expect(collectRevenue(state)).toEqual({ taxes: 8, commerce: 2 });

    // Embargo (Step047/P2): the connection floor halves UP, so a tech'd
    // workshop keeps its edge — ceil(3/2) = 2, never floor = 1.
    state.researchedTechs = ["tradeRoutes"];
    state.events = [{ kind: "tradeClosure", ticksLeft: 5 }];
    expect(collectRevenue(state)).toEqual({ taxes: 8, commerce: 2 });
  });

});

describe("maintenance", () => {
  it("charges 1 per operational non-exempt building, exempts residences, and clamps at 0", () => {
    const state = freshState();
    placeConnectedWorkshop(state); // 1 workshop + roads
    const home = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
    stepTicks(state, 2); // residence operational too
    const before = state.resources.money;
    expect(payMaintenance(state)).toBe(1); // housing is infrastructure (Step021)
    expect(state.resources.money).toBe(before - 1);

    state.resources.money = 0;
    payMaintenance(state);
    expect(state.resources.money).toBe(0); // partial payment, never negative

    const homes = freshState();
    stripToAnchor(homes);
    for (let i = 0; i < 3; i++) {
      const spot = freeCell(homes);
      mustOk(applyCommand(homes, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    }
    stepTicks(homes, 2);
    const m = homes.resources.money;
    expect(payMaintenance(homes)).toBe(0);
    expect(homes.resources.money).toBe(m);

    const building = freshState();
    stripToAnchor(building);
    const other = freeCell(building);
    mustOk(applyCommand(building, { kind: "placeBuilding", type: "residence", x: other.x, y: other.y }));
    const n = building.resources.money;
    expect(payMaintenance(building)).toBe(0); // under construction
    expect(building.resources.money).toBe(n);
  });

  it("cannot be farmed by residence spam or deactivate-reactivate cycling", () => {
    const spam = freshState();
    placeConnectedWorkshop(spam);
    spam.population = 8;
    spam.resources.money = 500; // test-level funding for the spam itself
    // The money model is the subject: the stripped colony has no farm, so a
    // 60-unit granary would now starve the taxpayers mid-measurement (Step067).
    spam.resources.food = 100;
    stepTicks(spam, 2);
    for (let i = 0; i < 5; i++) {
      const spot = freeCell(spam);
      mustOk(applyCommand(spam, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    }
    stepTicks(spam, 3); // all operational
    expect(payMaintenance(spam)).toBe(1); // residences stay exempt: spam is pure cost
    const m0 = spam.resources.money;
    stepTicks(spam, 1);
    expect(spam.resources.money).toBe(m0 + 9); // +8 taxes +2 commerce −1 upkeep

    const cycling = freshState();
    placeConnectedWorkshop(cycling);
    cycling.population = 8;
    const id = Object.keys(cycling.buildings).find((k) => cycling.buildings[k]?.type === "workshop");
    if (!id) throw new Error("workshop missing");
    mustOk(applyCommand(cycling, { kind: "setBuildingActive", id, active: false }));
    mustOk(applyCommand(cycling, { kind: "setBuildingActive", id, active: true }));
    // a single revenue computation prices the active workshop exactly once
    expect(collectRevenue(cycling)).toEqual({ taxes: 8, commerce: 2 });
  });
});

