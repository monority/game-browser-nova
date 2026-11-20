import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { addWater } from "@/domain/resource/resource.js";
import { consumeWater, waterProductionPerTick } from "@/domain/production/production.js";
import { getResourceSummaries, getAlerts } from "@/application/queries/analysis.js";
import { foodCapacity } from "@/domain/storage/storage.js";
import { stockedState, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "analysis-test", width: 16, height: 16 };

function freshState(): GameState {
  return stockedState(CONFIG);
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
  it("negative balance: countdown to depletion, and the trickle still counts", () => {
    const s = getResourceSummaries(drainingColony());
    expect(s.food).toMatchObject({
      productionPerTick: 1,
      consumptionPerTick: 2,
      balancePerTick: -1,
      stock: 9,
      // Step067: the countdown walks the conservation law forward (with the
      // fraction carried from the previous ticks) instead of a linear
      // stock / (−net) division, so the granary empties two ticks sooner.
      ticksRemaining: 7,
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

});

describe("alerts (states, not instructions)", () => {
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

    // Step073: above 0 the same standing deficit is stated as information, so
    // the player sees it before the wall instead of only at 0.
    state.resources.money = 50;
    expect(getAlerts(state)).toContainEqual({
      severity: "info",
      message: "Budget: net -1/tick before trade",
    });
    expect(getAlerts(state)).not.toContainEqual(
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("Treasury") }),
    );
  });

  it("reports degraded air as information until quality drops under the admission gate", () => {
    const state = fedColony();
    // quality = POLLUTION_MAX - pollution: 40 is under the alert threshold
    // (50) but above MIN_QUALITY_FOR_ADMISSION, so it is a nuisance, not a
    // fault; 20 is the gate itself failing and must warn.
    state.pollution = 60;
    expect(getAlerts(state)).toContainEqual({
      severity: "info",
      message: "Environment: quality 40 · pollution 60",
    });

    state.pollution = 80;
    expect(getAlerts(state)).toContainEqual({
      severity: "warning",
      message: "Environment: quality 20 · pollution 80",
    });
  });

  it("Step083: warns with a countdown while an air surplus is still closing the gate", () => {
    const state = freshState();
    stepTicks(state, 3);
    // The opening's park absorbs exactly its two unstaffed shops: net 0, so
    // there is nothing to count down and no air alert at all.
    expect(getAlerts(state).some((a) => a.message.startsWith("Environment: air closes"))).toBe(false);

    // Mothballing it to save 1/tick upkeep reopens a +2/tick flow. Before
    // Step083 the cockpit stayed silent for the ~37 ticks it takes the gate to
    // shut, which made the park's role invisible until the damage was done.
    const parkId = Object.values(state.buildings).find((b) => b.type === "park")?.id;
    if (!parkId) throw new Error("park missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: parkId, active: false }));
    expect(getAlerts(state)).toContainEqual({
      severity: "warning",
      message: expect.stringMatching(/^Environment: air closes admission in 3[0-9] ticks \(net \+2\/tick\)$/),
    });
  });

  it("reports a full granary as information, never a warning", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0; // no consumption: the colony trickle is a surplus
    stepTicks(state, 1);
    state.resources.food = foodCapacity(state);
    // Since Step067 conservation frees headroom every tick, so a pinned
    // granary is a reachable steady state of a healthy colony. Ranked as a
    // warning, it turned the cockpit verdict `critical` for 331 of 400 ticks
    // on a colony that was healthy by every other measure.
    expect(getAlerts(state)).toContainEqual({
      severity: "info",
      message: `Food storage full (${foodCapacity(state)}/${foodCapacity(state)})`,
    });
  });

});

