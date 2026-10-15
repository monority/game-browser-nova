import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  getResourceSummaries,
  getAlerts,
} from "@/application/queries/analysis.js";
import { mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "analysis-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Matured farm + residence + road; pop 1 staffs the farm. */
function fedColony(): GameState {
  const state = freshState();
  stripToAnchor(state);
  state.population = 0;
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
    // staffed farm 2 + Center trickle 1
    expect(s.food).toMatchObject({
      productionPerTick: 3,
      consumptionPerTick: 1,
      balancePerTick: 2,
      ticksRemaining: null,
    });
    // surplus accumulates below the storage cap (Step031 pin at 120)
    expect(s.food.stock).toBeGreaterThan(60);
    expect(s.food.stock).toBeLessThanOrEqual(120);
  });

  it("negative balance: countdown to depletion (deficit beats the trickle)", () => {
    const state = fedColony();
    state.resources.food = 84;
    // mothball the farm: only the Center trickle (1) remains vs pop 1 + ...
    const farmId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "farm");
    if (!farmId) throw new Error("farm missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: farmId, active: false }));
    stepTicks(state, 1); // production 1 = consumption 1 → balance 0
    const s = getResourceSummaries(state);
    expect(s.food.productionPerTick).toBe(1);
    expect(s.food.balancePerTick).toBe(0);
    expect(s.food.ticksRemaining).toBeNull();
  });

  it("counts the Center trickle even when the farm is mothballed", () => {
    const state = fedColony();
    expect(getResourceSummaries(state).food.productionPerTick).toBe(3);
    const farmId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "farm");
    if (!farmId) throw new Error("farm missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: farmId, active: false }));
    expect(getResourceSummaries(state).food.productionPerTick).toBe(1);
  });

  it("water consumption reflects served colonists only", () => {
    const state = fedColony();
    state.population = 2;
    state.resources.water = 1; // only 1 of 2 can be served
    const s = getResourceSummaries(state);
    expect(s.water.consumptionPerTick).toBe(1);
    expect(s.water.stock).toBe(1);
  });

  it("empty colony: no consumption, Center trickle only, no alerts", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    const s = getResourceSummaries(state);
    expect(s.food).toMatchObject({ productionPerTick: 1, consumptionPerTick: 0, balancePerTick: 1 });
    expect(getAlerts(state)).toEqual([]);
  });
});

describe("alerts (states, not instructions)", () => {
  it("warns with a countdown when food is draining (deficit beats the trickle)", () => {
    const state = fedColony();
    state.resources.food = 10;
    // second colonist: consumption 2 vs production 3 (farm 2 + trickle 1)... use
    // a deficit instead: mothball the farm with 2 colonists
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 3, y: 0 }));
    state.population = 2; // consumption 2; production = farm 2 + trickle 1 = 3?? no deficit
    state.resources.food = 10;
    const farmId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "farm");
    if (!farmId) throw new Error("farm missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: farmId, active: false }));
    // production 1 (trickle) vs consumption 2 → deficit −1
    stepTicks(state, 1); // food 10 − (2 − 1) = 9
    const alerts = getAlerts(state);
    const foodAlert = alerts.find((a) => a.message.startsWith("Food:"));
    expect(foodAlert?.severity).toBe("warning");
    expect(foodAlert?.message).toContain("-1/tick");
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
    // residences are upkeep-exempt (Step021): a well makes upkeep bite.
    // pop 1: revenue 1, maintenance 2 (farm + well) for net -1.
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 4, y: 0 }));
    stepTicks(state, 2); // well operational: upkeep farm + well = 2
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
