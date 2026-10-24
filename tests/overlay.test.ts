import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { computeOverlay, type OverlayCell, type OverlayMode } from "@/renderer/overlay.js";
import { getResourceContributors } from "@/application/queries/analysis.js";
import { housingCapacity } from "@/domain/population/population.js";
import { freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "overlay-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Road (0,0) + farm (1,0) + well (1,1) + workshop (1,2) + 2 residences, matured, pop 2. */
function staffedColony(): GameState {
  const state = freshState();
  stripToAnchor(state);
  state.population = 0;
  state.resources.money = 400;
  state.resources.water = 6;
  mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 0), cellKey(0, 1), cellKey(0, 2)] }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 0 }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: 1, y: 1 }));
  mustOk(applyCommand(state, { kind: "placeBuilding", type: "workshop", x: 1, y: 2 }));
  for (let i = 0; i < 2; i++) {
    const home = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: home.x, y: home.y }));
  }
  stepTicks(state, 6); // operational + admissions to pop 2
  return state;
}

function tints(state: GameState, mode: OverlayMode): Map<string, string> {
  return new Map(computeOverlay(state, mode).map((c: OverlayCell) => [c.key, c.tint]));
}

describe("staffing overlay mapping", () => {
  it("none produces no tints", () => {
    const state = staffedColony();
    expect(tints(state, "none").size).toBe(0);
  });

  it("staffed workplaces are ok; the anchor and residences are not tinted", () => {
    const state = staffedColony();
    const t = tints(state, "staffing");
    // pop 2 staffs farm + well (canonical order); workshop idle
    expect(t.get(cellKey(1, 0))).toBe("ok");
    expect(t.get(cellKey(1, 1))).toBe("ok");
    expect(t.get(cellKey(1, 2))).toBe("warn"); // idle workplace
    expect(t.has("colony-center")).toBe(false);
    // residences untinted: their keys are absent
    for (const b of Object.values(state.buildings)) {
      if (b.type === "residence") expect(t.has(cellKey(b.x, b.y))).toBe(false);
    }
  });

  it("mothballed workplaces are off and never ok/warn", () => {
    const state = staffedColony();
    const farmId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "farm");
    if (!farmId) throw new Error("farm missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: farmId, active: false }));
    const t = tints(state, "staffing");
    expect(t.get(cellKey(1, 0))).toBe("off");
  });

  it("road loss turns staffed workplaces into warn", () => {
    const state = staffedColony();
    const t0 = tints(state, "staffing");
    expect(t0.get(cellKey(1, 0))).toBe("ok"); // farm staffed
    mustOk(applyCommand(state, { kind: "removeRoads", cells: [cellKey(0, 0), cellKey(0, 1), cellKey(0, 2)] }));
    stepTicks(state, 1); // reassignment: colonists move to remaining staffable jobs
    const t = tints(state, "staffing");
    expect(t.get(cellKey(1, 0))).toBe("warn"); // idle: no road access
    expect(t.get(cellKey(1, 0))).not.toBe("ok");
  });

  it("deposits mode produces no building tints (markers carry the data)", () => {
    const state = staffedColony();
    expect(tints(state, "deposits").size).toBe(0);
  });
});

describe("food overlay mapping", () => {
  it("staffed farm with a non-negative balance is ok; well/workshop/residences untinted", () => {
    const state = staffedColony();
    // food: staffed farm 2 + Center trickle 1 = 3; consumption 2 → balance +1
    const t = tints(state, "food");
    expect(t.get(cellKey(1, 0))).toBe("ok");
    expect(t.has(cellKey(1, 1))).toBe(false); // well
    expect(t.has(cellKey(1, 2))).toBe(false); // workshop
    for (const b of Object.values(state.buildings)) {
      if (b.type === "residence") expect(t.has(cellKey(b.x, b.y))).toBe(false);
    }
  });

  it("negative food balance turns the producing farm warn", () => {
    const state = staffedColony();
    state.population = 50; // consumption 50 vs production 3
    expect(tints(state, "food").get(cellKey(1, 0))).toBe("warn");
  });

  it("mothballed farms are off", () => {
    const state = staffedColony();
    const farmId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "farm");
    if (!farmId) throw new Error("farm missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: farmId, active: false }));
    expect(tints(state, "food").get(cellKey(1, 0))).toBe("off");
  });

  it("under-construction farms are untinted", () => {
    const state = staffedColony();
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(0, 3)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "farm", x: 1, y: 3 }));
    const building = Object.values(state.buildings).find(
      (b) => b.type === "farm" && b.x === 1 && b.y === 3,
    );
    if (!building) throw new Error("farm missing");
    expect(building.status).toBe("underConstruction");
    expect(tints(state, "food").has(cellKey(1, 3))).toBe(false);
  });
});

describe("water overlay mapping", () => {
  it("well ok when the water balance covers the population; deficit warns", () => {
    const state = staffedColony();
    // well staffed → 2/tick; pop 2 → balance 0 → ok
    expect(tints(state, "water").get(cellKey(1, 1))).toBe("ok");
    state.population = 50;
    expect(tints(state, "water").get(cellKey(1, 1))).toBe("warn");
  });

  it("mothballed wells are off", () => {
    const state = staffedColony();
    const wellId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "well");
    if (!wellId) throw new Error("well missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wellId, active: false }));
    expect(tints(state, "water").get(cellKey(1, 1))).toBe("off");
  });

  it("farms and other buildings are not tinted", () => {
    const state = staffedColony();
    const t = tints(state, "water");
    expect(t.has(cellKey(1, 0))).toBe(false); // farm
    expect(t.has(cellKey(1, 2))).toBe(false); // workshop
  });
});

describe("pollution overlay mapping", () => {
  it("active emitters are ok while quality stays high; farms untinted", () => {
    const state = staffedColony();
    const t = tints(state, "pollution");
    expect(t.get(cellKey(1, 2))).toBe("ok"); // active workshop, quality 94
    expect(t.has(cellKey(1, 0))).toBe(false); // farm
    expect(t.has(cellKey(1, 1))).toBe(false); // well
  });

  it("emitters turn warn when quality drops below the alert threshold", () => {
    const state = staffedColony();
    state.pollution = 60; // quality 40 < 50
    expect(tints(state, "pollution").get(cellKey(1, 2))).toBe("warn");
  });

  it("mothballed emitters are off", () => {
    const state = staffedColony();
    const workshopId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "workshop");
    if (!workshopId) throw new Error("workshop missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: workshopId, active: false }));
    expect(tints(state, "pollution").get(cellKey(1, 2))).toBe("off");
  });

  it("parks are untinted under construction, ok while active, off when mothballed", () => {
    const state = staffedColony();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
    expect(tints(state, "pollution").has(cellKey(spot.x, spot.y))).toBe(false); // under construction
    stepTicks(state, 3);
    expect(tints(state, "pollution").get(cellKey(spot.x, spot.y))).toBe("ok");
    const parkId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "park");
    if (!parkId) throw new Error("park missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: parkId, active: false }));
    expect(tints(state, "pollution").get(cellKey(spot.x, spot.y))).toBe("off");
  });
});

describe("population overlay mapping", () => {
  it("operational residences are ok while housing has room; only residences tint", () => {
    const state = staffedColony();
    state.population = 1; // capacity 2 — one bed free, growth possible
    const t = tints(state, "population");
    for (const b of Object.values(state.buildings)) {
      if (b.type === "residence") {
        expect(t.get(cellKey(b.x, b.y))).toBe("ok");
      } else {
        expect(t.has(cellKey(b.x, b.y))).toBe(false);
      }
    }
  });

  it("residences warn when the population reaches housing capacity (growth capped)", () => {
    const state = staffedColony();
    state.population = housingCapacity(state);
    const t = tints(state, "population");
    for (const b of Object.values(state.buildings)) {
      if (b.type === "residence") expect(t.get(cellKey(b.x, b.y))).toBe("warn");
    }
  });

  it("mothballed residences are off", () => {
    const state = staffedColony();
    const home = Object.values(state.buildings).find((b) => b.type === "residence");
    if (!home) throw new Error("residence missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: home.id, active: false }));
    expect(tints(state, "population").get(cellKey(home.x, home.y))).toBe("off");
  });

  it("under-construction residences are untinted", () => {
    const state = staffedColony();
    const spot = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    expect(tints(state, "population").has(cellKey(spot.x, spot.y))).toBe(false);
  });
});

describe("resource contributors (drill-down)", () => {
  it("lists all producers of the resource with their state", () => {
    const state = staffedColony();
    const c = getResourceContributors(state, "food");
    expect(c.resource).toBe("food");
    expect(c.producers.length).toBe(1);
    expect(c.producers[0]).toMatchObject({ type: "farm", staffed: true, active: true });
    expect(c.consumptionPerTick).toBe(2); // pop 2
  });

  it("water contributors include mothballed wells (state visible)", () => {
    const state = staffedColony();
    const wellId = Object.keys(state.buildings).find((k) => state.buildings[k]?.type === "well");
    if (!wellId) throw new Error("well missing");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: wellId, active: false }));
    const c = getResourceContributors(state, "water");
    expect(c.producers.length).toBe(1);
    expect(c.producers[0]).toMatchObject({ type: "well", active: false, staffed: false });
  });

  it("empty colony: no producers, zero consumption", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    const c = getResourceContributors(state, "food");
    expect(c.producers).toEqual([]);
    expect(c.consumptionPerTick).toBe(0);
  });
});
