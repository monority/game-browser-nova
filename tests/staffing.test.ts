import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import { getStaffingOverview } from "../src/application/queries/staffing.js";
import { getAlerts } from "../src/application/queries/analysis.js";
import { mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "staffing-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Bare colony: anchor only, no population, empty treasury. */
function bare(): GameState {
  const state = freshState();
  stripToAnchor(state);
  state.population = 0; // isolate the overview from D2's starting colonists
  state.resources.money = 0;
  return state;
}

/** Road-connected operational workplace row along y=2 (world has no blocked cells there). */
function workplaceRow(
  state: GameState,
  types: Array<"farm" | "well" | "workshop" | "lumberCamp" | "quarry" | "park" | "market">,
): void {
  state.resources.money = 500;
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 3), cellKey(1, 3), cellKey(2, 3)] }));
  types.forEach((type, i) => {
    mustOk(applyCommand(state, { kind: "placeBuilding", type, x: i, y: 2 }));
  });
  stepTicks(state, 2); // operational; staffing runs at the end of tick 2
}

describe("getStaffingOverview (Step025)", () => {
  it("bare colony: no eligible workplaces, no workers", () => {
    const state = bare();
    const overview = getStaffingOverview(state);
    expect(overview.eligible).toBe(0);
    expect(overview.staffed).toBe(0);
    expect(overview.workers).toBe(0);
    expect(overview.entries).toEqual([]);
  });

  it("eligible workplaces ranked in canonical (y,x,id) order", () => {
    const state = bare();
    // farms at (0,2),(1,2),(0,1): canonical order = y asc, x asc
    state.resources.money = 500;
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 3), cellKey(1, 3), cellKey(0, 0)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 0, y: 2 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 2 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 0, y: 1 }));
    stepTicks(state, 2);
    state.population = 10;
    const overview = getStaffingOverview(state);
    expect(overview.eligible).toBe(3);
    expect(overview.entries.map((e) => [e.x, e.y])).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    expect(overview.entries.map((e) => e.order)).toEqual([1, 2, 3]);
  });

  it("workers staff in rank order; surplus workers leave the tail idle", () => {
    const state = bare();
    workplaceRow(state, ["farm", "well", "workshop"]);
    state.population = 2;
    const overview = getStaffingOverview(state);
    expect(overview.workers).toBe(2);
    expect(overview.eligible).toBe(3);
    expect(overview.staffed).toBe(2);
    expect(overview.entries.map((e) => e.state)).toEqual(["staffed", "staffed", "idle"]);
  });

  it("idle reason is no-workers, not no-road, when the queue exhausts", () => {
    const state = bare();
    workplaceRow(state, ["farm", "well", "workshop"]);
    state.population = 1;
    const overview = getStaffingOverview(state);
    const idle = overview.entries.filter((e) => e.state === "idle");
    expect(idle).toHaveLength(2);
    for (const entry of idle) {
      expect(entry.reason).toBe("no-workers");
    }
  });

  it("no-road workplaces are never eligible and report no-road", () => {
    const state = bare();
    state.resources.money = 500;
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 3, y: 3 }));
    stepTicks(state, 2);
    state.population = 5;
    const overview = getStaffingOverview(state);
    expect(overview.eligible).toBe(0);
    expect(overview.entries).toHaveLength(1);
    expect(overview.entries[0]).toMatchObject({ state: "no-road", order: null });
  });

  it("mothballed workplaces are never eligible and report mothballed", () => {
    const state = bare();
    workplaceRow(state, ["farm", "well"]);
    const farmId = Object.values(state.buildings).find((b) => b.type === "farm")!.id;
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: farmId, active: false }));
    stepTicks(state, 1);
    state.population = 5;
    const overview = getStaffingOverview(state);
    expect(overview.eligible).toBe(1);
    const farm = overview.entries.find((e) => e.id === farmId)!;
    expect(farm.state).toBe("mothballed");
    // mothballing frees the worker: the well keeps its staff
    expect(overview.entries.find((e) => e.type === "well")!.state).toBe("staffed");
  });

  it("under-construction workplaces are listed but never eligible", () => {
    const state = bare();
    state.resources.money = 500;
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 3)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 0, y: 2 }));
    // farm: constructionTicks > 0, so no tick ran yet
    const overview = getStaffingOverview(state);
    expect(overview.entries).toHaveLength(1);
    expect(overview.entries[0]).toMatchObject({ state: "under-construction", order: null });
    expect(overview.eligible).toBe(0);
  });

  it("non-workplaces (residence, colony center) are excluded", () => {
    const state = bare();
    state.resources.money = 500;
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(1, 1)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: 1, y: 2 }));
    stepTicks(state, 2);
    const overview = getStaffingOverview(state);
    expect(overview.entries.every((e) => e.type !== "residence" && e.type !== "colonyCenter")).toBe(true);
  });

  it("staffing line: rank and state for eligible workplaces", () => {
    const state = bare();
    workplaceRow(state, ["farm", "well", "workshop"]);
    state.population = 1;
    const overview = getStaffingOverview(state);
    const line = (id: string) => overview.entries.find((e) => e.id === id)!.staffingLine;
    const farm = overview.entries[0]!;
    const workshop = overview.entries[2]!;
    expect(line(farm.id)).toBe("staffing 1/3 · staffed");
    expect(line(workshop.id)).toBe("staffing 3/3 · idle");
  });

  it("overview is deterministic across identical states (no hidden ordering)", () => {
    const build = () => {
      const state = bare();
      workplaceRow(state, ["farm", "well", "workshop", "park"]);
      state.population = 3;
      return getStaffingOverview(state);
    };
    expect(build()).toEqual(build());
  });
});

describe("workforce alert (Step025)", () => {
  it("no alert when every eligible workplace is staffed", () => {
    const state = bare();
    workplaceRow(state, ["farm", "well"]);
    state.population = 5;
    expect(getAlerts(state).some((a) => a.message.startsWith("Workforce:"))).toBe(false);
  });

  it("info alert states staffed/eligible when workers run out", () => {
    const state = bare();
    workplaceRow(state, ["farm", "well", "workshop"]);
    state.population = 1;
    const alert = getAlerts(state).find((a) => a.message.startsWith("Workforce:"));
    expect(alert).toEqual({ severity: "info", message: "Workforce: 1/3 workplaces staffed" });
  });

  it("no workforce alert while the colony has no colonists", () => {
    const state = bare();
    workplaceRow(state, ["farm", "well"]);
    state.population = 0;
    expect(getAlerts(state).some((a) => a.message.startsWith("Workforce:"))).toBe(false);
  });
});
