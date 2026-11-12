import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { addWater } from "@/domain/resource/resource.js";
import { consumeWater, waterProductionPerTick } from "@/domain/production/production.js";
import { getResourceSummaries, getAlerts } from "@/application/queries/analysis.js";
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

/** Mothball the only farm: 1 trickle produced, 2 colonists eating → −1/tick. */
function drainingColony(): GameState {
  const state = fedColony();
  state.population = 2;
  state.resources.food = 10;
  const farmId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "farm");
  if (!farmId) throw new Error("farm missing");
  mustOk(applyCommand(state, { kind: "setBuildingActive", id: farmId, active: false }));
  stepTicks(state, 1); // stock 9, balance −1
  return state;
}

function wellColony(water: number): GameState {
  const state = fedColony();
  state.population = 2;
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(4, 0)] }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 3, y: 0 }));
  stepTicks(state, 3); // well staffed and operational: 2 water/tick
  state.resources.water = water;
  return state;
}

describe("resource summaries", () => {
  it("positive balance: production exceeds consumption, no countdown", () => {
    const s = getResourceSummaries(fedColony());
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

  it("negative balance: countdown to depletion, and the trickle still counts", () => {
    const s = getResourceSummaries(drainingColony());
    expect(s.food).toMatchObject({
      productionPerTick: 1,
      consumptionPerTick: 2,
      balancePerTick: -1,
      stock: 9,
      ticksRemaining: 9,
    });
  });

  it("water consumption reflects the colony need, not the served amount (F12)", () => {
    const state = fedColony();
    state.population = 2;
    state.resources.water = 1; // only 1 of 2 can be served
    const s = getResourceSummaries(state);
    expect(s.water).toMatchObject({
      consumptionPerTick: 2,
      balancePerTick: -2,
      stock: 1,
      ticksRemaining: 0,
    });
    // the served amount stays the shortage signal in the alert
    expect(getAlerts(state)).toContainEqual({
      severity: "warning",
      message: "Water: 1/2 colonists served",
    });
  });

  it("empty colony: no consumption, Center trickle only, no alerts", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    expect(getResourceSummaries(state).food).toMatchObject({
      productionPerTick: 1,
      consumptionPerTick: 0,
      balancePerTick: 1,
    });
    expect(getAlerts(state)).toEqual([]);
  });
});

describe("alerts (states, not instructions)", () => {
  it("warns with the exact countdown when food is draining", () => {
    expect(getAlerts(drainingColony())).toContainEqual({
      severity: "warning",
      message: "Food: -1/tick · stock 9 → 9 ticks",
    });
  });

  it("keeps the water alert equal to the service the tick really delivers (Step063)", () => {
    for (const water of [0, 1, 2, 3, 4, 7]) {
      const state = wellColony(water);
      const warned = getAlerts(state).some((a) => a.message.startsWith("Water:"));
      const probe = wellColony(water);
      addWater(probe.resources, waterProductionPerTick(probe)); // phase 2
      const served = consumeWater(probe); // phase 5
      expect(warned, `water ${water}`).toBe(served < probe.population);
      expect(served, `water ${water}`).toBe(Math.min(water + 2, probe.population));
    }
    // a well that covers the need leaves no shortage line, even with a low stock
    const covered = wellColony(1);
    expect(covered.resources.water).toBeLessThan(covered.population);
    expect(getAlerts(covered).some((a) => a.message.startsWith("Water:"))).toBe(false);
  });

  it("warns when the treasury is frozen at 0 with a negative net, and stays silent otherwise", () => {
    const state = fedColony();
    // residences are upkeep-exempt (Step021): a well makes upkeep bite
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 4, y: 0 }));
    stepTicks(state, 2); // well operational: upkeep farm + well = 2
    state.resources.money = 0;
    // pop 1: revenue 1, maintenance 2 → net −1
    expect(getAlerts(state)).toContainEqual({
      severity: "warning",
      message: "Treasury: frozen at 0 · net -1/tick",
    });

    state.resources.money = 50;
    expect(getAlerts(state)).not.toContainEqual(
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("Treasury") }),
    );
  });

  it("never prescribes a solution (design rule)", () => {
    const state = fedColony();
    state.resources.money = 0;
    for (const alert of getAlerts(state)) {
      const message = alert.message.toLowerCase();
      expect(message).not.toContain("build");
      expect(message).not.toContain("place");
      expect(message).not.toContain("add ");
    }
  });

  it("reuses precomputed summaries (Tier2 boot shares one projection per tick)", () => {
    const state = fedColony();
    state.population = 2;
    state.resources.water = 1;
    const summaries = getResourceSummaries(state);
    expect(getAlerts(state, summaries)).toEqual(getAlerts(state));
  });
});

describe("growth-blocked alert (Step053 F1)", () => {
  it("warns only while air quality blocks admission with housing and food available", () => {
    const state = fedColony();
    state.resources.money = 300;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 3, y: 0 }));
    state.pollution = 80; // degraded air blocks admission while it matures
    stepTicks(state, 2); // housing 2 > pop 1 (quality 20 < 25)
    const line = getAlerts(state).find((a) => a.message.startsWith("Growth blocked"));
    expect(line?.severity).toBe("warning");
    expect(line?.message).toContain("air quality 20");
    expect(line?.message).toContain("threshold 25");
    expect(line?.message).toContain("pollution 80");

    state.pollution = 10; // quality 90
    expect(getAlerts(state).some((a) => a.message.startsWith("Growth blocked"))).toBe(false);
  });
});
