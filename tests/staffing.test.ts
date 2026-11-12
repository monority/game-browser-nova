import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { getStaffingOverview } from "@/application/queries/staffing.js";
import { getAlerts } from "@/application/queries/analysis.js";
import { getColonyStats } from "@/application/queries/stats.js";
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
  types: Array<"farm" | "well" | "workshop" | "lumberCamp" | "quarry" | "park">,
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
    expect(getStaffingOverview(bare())).toMatchObject({
      eligible: 0,
      staffed: 0,
      workers: 0,
      entries: [],
    });
  });

  it("ranks workplaces canonically (y, x, id), staffs in rank order, leaves the tail idle", () => {
    const ranked = bare();
    ranked.resources.money = 500;
    mustOk(applyCommand(ranked, { kind: "placeRoads", cells: [cellKey(0, 3), cellKey(1, 3), cellKey(0, 0)] }));
    mustOk(applyCommand(ranked, { kind: "placeBuilding", type: "farm", x: 0, y: 2 }));
    mustOk(applyCommand(ranked, { kind: "placeBuilding", type: "farm", x: 1, y: 2 }));
    mustOk(applyCommand(ranked, { kind: "placeBuilding", type: "farm", x: 0, y: 1 }));
    stepTicks(ranked, 2);
    ranked.population = 10;
    const overview = getStaffingOverview(ranked);
    expect(overview.eligible).toBe(3);
    expect(overview.entries.map((e) => [e.x, e.y])).toEqual([[0, 1], [0, 2], [1, 2]]);
    expect(overview.entries.map((e) => e.order)).toEqual([1, 2, 3]);

    const short = bare();
    workplaceRow(short, ["farm", "well", "workshop"]);
    short.population = 2;
    const two = getStaffingOverview(short);
    expect(two).toMatchObject({ workers: 2, eligible: 3, staffed: 2 });
    expect(two.entries.map((e) => e.state)).toEqual(["staffed", "staffed", "idle"]);
    // an idle tail reports no-workers (road access is not the cause)
    for (const entry of two.entries.filter((e) => e.state === "idle")) {
      expect(entry.reason).toBe("no-workers");
    }
    // staffing line: rank and state
    const line = (index: number) => two.entries[index]?.staffingLine;
    expect(line(0)).toBe("staffing 1/3 · staffed");
    expect(line(2)).toBe("staffing 3/3 · idle");
  });

  it("reports no-road, mothballed and under-construction as ineligible, and lists no non-workplace", () => {
    const unconnected = bare();
    unconnected.resources.money = 500;
    mustOk(applyCommand(unconnected, { kind: "placeBuilding", type: "farm", x: 3, y: 3 }));
    stepTicks(unconnected, 2);
    unconnected.population = 5;
    const road1 = getStaffingOverview(unconnected);
    expect(road1).toMatchObject({ eligible: 0, unconnected: 1 });
    expect(road1.entries[0]).toMatchObject({ state: "no-road", order: null });

    const mothballed = bare();
    workplaceRow(mothballed, ["farm", "well"]);
    const farmId = Object.values(mothballed.buildings).find((b) => b.type === "farm")?.id;
    if (!farmId) throw new Error("farm missing");
    mustOk(applyCommand(mothballed, { kind: "setBuildingActive", id: farmId, active: false }));
    stepTicks(mothballed, 1);
    mothballed.population = 5;
    const off = getStaffingOverview(mothballed);
    expect(off.eligible).toBe(1);
    expect(off.entries.find((e) => e.id === farmId)?.state).toBe("mothballed");
    // mothballing frees the worker: the well keeps its staff
    expect(off.entries.find((e) => e.type === "well")?.state).toBe("staffed");

    const building = bare();
    building.resources.money = 500;
    mustOk(applyCommand(building, { kind: "placeRoads", cells: [cellKey(0, 3)] }));
    mustOk(applyCommand(building, { kind: "placeBuilding", type: "farm", x: 0, y: 2 }));
    expect(getStaffingOverview(building).entries[0]).toMatchObject({
      state: "under-construction",
      order: null,
    });

    const homes = bare();
    homes.resources.money = 500;
    mustOk(applyCommand(homes, { kind: "placeRoads", cells: [cellKey(1, 1)] }));
    mustOk(applyCommand(homes, { kind: "placeBuilding", type: "residence", x: 1, y: 2 }));
    stepTicks(homes, 2);
    expect(
      getStaffingOverview(homes).entries.every(
        (e) => e.type !== "residence" && e.type !== "colonyCenter",
      ),
    ).toBe(true);
  });

  it("is deterministic across identical states (no hidden ordering)", () => {
    const build = () => {
      const state = bare();
      workplaceRow(state, ["farm", "well", "workshop", "park"]);
      state.population = 3;
      return getStaffingOverview(state);
    };
    expect(build()).toEqual(build());
  });
});

describe("workforce alerts (Step025, reworked Step057 F5)", () => {
  it("never alerts on a structural shortage, but warns about road access when it is the cause", () => {
    const shortage = bare();
    workplaceRow(shortage, ["farm", "well", "workshop"]);
    shortage.population = 1; // 1/3: the D2-style permanent shortage
    // the fact reaches the stats surface...
    expect(getColonyStats(shortage)).toMatchObject({
      staffedWorkplaces: 1,
      eligibleWorkplaces: 3,
    });
    // ...and the alert stream stays quiet about it
    expect(getAlerts(shortage).some((a) => a.message.startsWith("Workforce:"))).toBe(false);
    expect(getAlerts(shortage).some((a) => a.message.startsWith("Workplaces:"))).toBe(false);

    const stranded = bare();
    stranded.resources.money = 500;
    mustOk(applyCommand(stranded, { kind: "placeBuilding", type: "farm", x: 3, y: 3 }));
    stepTicks(stranded, 2);
    stranded.population = 5;
    expect(getAlerts(stranded).find((a) => a.message.startsWith("Workplaces:"))).toEqual({
      severity: "info",
      message: "Workplaces: 1 without road access",
    });

    const connected = bare();
    workplaceRow(connected, ["farm", "well"]);
    connected.population = 5;
    expect(getStaffingOverview(connected).unconnected).toBe(0);
    expect(getAlerts(connected).some((a) => a.message.startsWith("Workplaces:"))).toBe(false);

    const empty = bare();
    workplaceRow(empty, ["farm", "well"]);
    empty.population = 0;
    expect(getAlerts(empty).some((a) => a.message.startsWith("Workplaces:"))).toBe(false);
  });
});
