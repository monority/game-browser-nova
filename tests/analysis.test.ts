import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import {
  getResourceSummaries,
  getAlerts,
} from "../src/application/queries/analysis.js";
import { mustOk } from "./helpers.js";

const CONFIG = { seed: "analysis-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Matured farm + residence + road; pop 1 staffs the farm. */
function fedColony(): GameState {
  const state = freshState();
  state.resources.money = 300;
  state.resources.water = 4;
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0)] }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 2, y: 0 }));
  stepTicks(state, 3);
  return state;
}

describe("resource summaries", () => {
  it("positive balance: production exceeds consumption, no countdown", () => {
    const state = fedColony();
    const s = getResourceSummaries(state);
    expect(s.food).toMatchObject({
      productionPerTick: 2,
      consumptionPerTick: 1,
      balancePerTick: 1,
      ticksRemaining: null,
    });
    expect(s.food.stock).toBeGreaterThan(90);
  });

  it("negative balance: countdown to depletion", () => {
    const state = fedColony();
    state.resources.food = 84;
    // silence production: mothball the farm
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: "building-1", active: false }));
    stepTicks(state, 1); // food 84 ≥ pop 1 → fed → 83 left, pop survives
    const s = getResourceSummaries(state);
    expect(s.food.productionPerTick).toBe(0);
    expect(s.food.balancePerTick).toBe(-1);
    expect(s.food.ticksRemaining).toBe(83); // floor(83 / 1)
  });

  it("counts only staffed active producers (mothballed farm excluded)", () => {
    const state = fedColony();
    const before = getResourceSummaries(state).food.productionPerTick;
    expect(before).toBe(2);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: "building-1", active: false }));
    expect(getResourceSummaries(state).food.productionPerTick).toBe(0);
  });

  it("water consumption reflects served colonists only", () => {
    const state = fedColony();
    state.population = 2;
    state.resources.water = 1; // only 1 of 2 can be served
    const s = getResourceSummaries(state);
    expect(s.water.consumptionPerTick).toBe(1);
    expect(s.water.stock).toBe(1);
  });

  it("empty colony: zero consumption, no alerts", () => {
    const state = freshState();
    const s = getResourceSummaries(state);
    expect(s.food).toMatchObject({ productionPerTick: 0, consumptionPerTick: 0, balancePerTick: 0 });
    expect(getAlerts(state)).toEqual([]);
  });
});

describe("alerts (states, not instructions)", () => {
  it("warns with a countdown when food is draining", () => {
    const state = fedColony();
    state.resources.food = 10;
    // mothball farm → deficit −1/tick, pop 1 still fed this tick
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: "building-1", active: false }));
    stepTicks(state, 1); // food 10 → 9
    const alerts = getAlerts(state);
    const foodAlert = alerts.find((a) => a.message.startsWith("Food:"));
    expect(foodAlert?.severity).toBe("warning");
    expect(foodAlert?.message).toContain("-1/tick");
    expect(foodAlert?.message).toContain("9 → 9 ticks");
  });

  it("warns when water does not serve the whole population", () => {
    const state = fedColony();
    state.population = 2;
    state.resources.water = 1;
    const alerts = getAlerts(state);
    expect(alerts).toContainEqual({
      severity: "warning",
      message: "Water: 1/2 colonists served",
    });
  });

  it("warns when the treasury is frozen at 0 with a negative net", () => {
    const state = fedColony();
    state.resources.money = 0;
    // pop 1: revenue 1, maintenance 2 (farm + residence) → net −1
    const alerts = getAlerts(state);
    expect(alerts).toContainEqual({
      severity: "warning",
      message: "Treasury: frozen at 0 · net -1/tick",
    });
  });

  it("no treasury alert when money is available", () => {
    const state = fedColony();
    state.resources.money = 50;
    expect(getAlerts(state)).not.toContainEqual(
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("Treasury") }),
    );
  });

  it("never prescribes a solution (design rule)", () => {
    const state = fedColony();
    state.resources.money = 0;
    for (const alert of getAlerts(state)) {
      expect(alert.message.toLowerCase()).not.toContain("build");
      expect(alert.message.toLowerCase()).not.toContain("place");
      expect(alert.message.toLowerCase()).not.toContain("add ");
    }
  });
});
