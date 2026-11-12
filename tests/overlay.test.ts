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

function buildingOf(
  state: GameState,
  predicate: (b: GameState["buildings"][string]) => boolean,
): GameState["buildings"][string] {
  const id = Object.keys(state.buildings).find((k) => {
    const b = state.buildings[k];
    return b !== undefined && predicate(b);
  });
  if (!id) throw new Error("building missing");
  const building = state.buildings[id];
  if (!building) throw new Error("building missing");
  return building;
}

function idOf(state: GameState, predicate: (b: GameState["buildings"][string]) => boolean): string {
  return buildingOf(state, predicate).id;
}

function residences(state: GameState) {
  return Object.values(state.buildings).filter((b) => b.type === "residence");
}

describe("inactive modes", () => {
  it("none and deposits produce no building tints (markers carry the data)", () => {
    const state = staffedColony();
    expect(tints(state, "none").size).toBe(0);
    expect(tints(state, "deposits").size).toBe(0);
  });
});

describe("staffing overlay mapping", () => {
  it("staffs canonically, warns idle workplaces, untints the anchor and residences", () => {
    const state = staffedColony();
    const t = tints(state, "staffing");
    expect(t.get(cellKey(1, 0))).toBe("ok"); // pop 2 staffs farm + well
    expect(t.get(cellKey(1, 1))).toBe("ok");
    expect(t.get(cellKey(1, 2))).toBe("warn"); // workshop idle
    expect(t.has("colony-center")).toBe(false);
    for (const b of residences(state)) expect(t.has(cellKey(b.x, b.y))).toBe(false);
  });

  it("mothballs workplaces to off and turns them warn when road access is lost", () => {
    const mothballed = staffedColony();
    mustOk(applyCommand(mothballed, {
      kind: "setBuildingActive",
      id: idOf(mothballed, (b) => b.type === "farm"),
      active: false,
    }));
    expect(tints(mothballed, "staffing").get(cellKey(1, 0))).toBe("off");

    const cut = staffedColony();
    expect(tints(cut, "staffing").get(cellKey(1, 0))).toBe("ok");
    mustOk(applyCommand(cut, { kind: "removeRoads", cells: [cellKey(0, 0), cellKey(0, 1), cellKey(0, 2)] }));
    stepTicks(cut, 1); // reassignment: colonists move to remaining staffable jobs
    expect(tints(cut, "staffing").get(cellKey(1, 0))).toBe("warn");
  });
});

describe("food overlay mapping", () => {
  it("tints only the producing farm: ok, warn on deficit, off, and untinted otherwise", () => {
    const covered = staffedColony(); // farm 2 + trickle 1 = 3 vs 2 eaten → +1
    const t = tints(covered, "food");
    expect(t.get(cellKey(1, 0))).toBe("ok");
    expect(t.has(cellKey(1, 1))).toBe(false); // well
    expect(t.has(cellKey(1, 2))).toBe(false); // workshop
    for (const b of residences(covered)) expect(t.has(cellKey(b.x, b.y))).toBe(false);

    const deficit = staffedColony();
    deficit.population = 50; // consumption 50 vs production 3
    expect(tints(deficit, "food").get(cellKey(1, 0))).toBe("warn");

    const mothballed = staffedColony();
    mustOk(applyCommand(mothballed, {
      kind: "setBuildingActive",
      id: idOf(mothballed, (b) => b.type === "farm"),
      active: false,
    }));
    expect(tints(mothballed, "food").get(cellKey(1, 0))).toBe("off");

    const building = staffedColony();
    mustOk(applyCommand(building, { kind: "placeRoads", cells: [cellKey(0, 3)] }));
    mustOk(applyCommand(building, { kind: "placeBuilding", type: "farm", x: 1, y: 3 }));
    expect(buildingOf(building, (b) => b.type === "farm" && b.x === 1 && b.y === 3).status)
      .toBe("underConstruction");
    expect(tints(building, "food").has(cellKey(1, 3))).toBe(false);
  });
});

describe("water overlay mapping", () => {
  it("tints only wells: ok when the balance covers the population, warn, off", () => {
    const covered = staffedColony(); // well 2/tick vs pop 2 → balance 0
    const t = tints(covered, "water");
    expect(t.get(cellKey(1, 1))).toBe("ok");
    expect(t.has(cellKey(1, 0))).toBe(false); // farm
    expect(t.has(cellKey(1, 2))).toBe(false); // workshop

    const deficit = staffedColony();
    deficit.population = 50;
    expect(tints(deficit, "water").get(cellKey(1, 1))).toBe("warn");

    const mothballed = staffedColony();
    mustOk(applyCommand(mothballed, {
      kind: "setBuildingActive",
      id: idOf(mothballed, (b) => b.type === "well"),
      active: false,
    }));
    expect(tints(mothballed, "water").get(cellKey(1, 1))).toBe("off");
  });
});

describe("pollution overlay mapping", () => {
  it("tints active emitters and parks only, following quality and activity", () => {
    const clean = staffedColony();
    const t = tints(clean, "pollution");
    expect(t.get(cellKey(1, 2))).toBe("ok"); // active workshop, quality 94
    expect(t.has(cellKey(1, 0))).toBe(false); // farm
    expect(t.has(cellKey(1, 1))).toBe(false); // well

    const dirty = staffedColony();
    dirty.pollution = 60; // quality 40 < 50
    expect(tints(dirty, "pollution").get(cellKey(1, 2))).toBe("warn");

    const mothballed = staffedColony();
    mustOk(applyCommand(mothballed, {
      kind: "setBuildingActive",
      id: idOf(mothballed, (b) => b.type === "workshop"),
      active: false,
    }));
    expect(tints(mothballed, "pollution").get(cellKey(1, 2))).toBe("off");

    const parks = staffedColony();
    const spot = freeCell(parks);
    mustOk(applyCommand(parks, { kind: "placeBuilding", type: "park", x: spot.x, y: spot.y }));
    expect(tints(parks, "pollution").has(cellKey(spot.x, spot.y))).toBe(false); // under construction
    stepTicks(parks, 3);
    expect(tints(parks, "pollution").get(cellKey(spot.x, spot.y))).toBe("ok");
    mustOk(applyCommand(parks, {
      kind: "setBuildingActive",
      id: idOf(parks, (b) => b.type === "park"),
      active: false,
    }));
    expect(tints(parks, "pollution").get(cellKey(spot.x, spot.y))).toBe("off");
  });
});

describe("population overlay mapping", () => {
  it("tints only residences: ok with a free bed, warn at the cap, off, untinted while building", () => {
    const room = staffedColony();
    room.population = 1; // capacity 2 — growth possible
    for (const [key, tint] of tints(room, "population")) {
      expect(residences(room).some((b) => cellKey(b.x, b.y) === key)).toBe(true);
      expect(tint).toBe("ok");
    }

    const capped = staffedColony();
    capped.population = housingCapacity(capped);
    const t = tints(capped, "population");
    for (const b of residences(capped)) expect(t.get(cellKey(b.x, b.y))).toBe("warn");

    const mothballed = staffedColony();
    const home = residences(mothballed)[0];
    if (!home) throw new Error("residence missing");
    mustOk(applyCommand(mothballed, { kind: "setBuildingActive", id: home.id, active: false }));
    expect(tints(mothballed, "population").get(cellKey(home.x, home.y))).toBe("off");

    const building = staffedColony();
    const spot = freeCell(building);
    mustOk(applyCommand(building, { kind: "placeBuilding", type: "residence", x: spot.x, y: spot.y }));
    expect(tints(building, "population").has(cellKey(spot.x, spot.y))).toBe(false);
  });
});

describe("resource contributors (drill-down)", () => {
  it("lists producers with their live state, mothballed ones included", () => {
    const state = staffedColony();
    const food = getResourceContributors(state, "food");
    expect(food.resource).toBe("food");
    expect(food.producers).toHaveLength(1);
    expect(food.producers[0]).toMatchObject({ type: "farm", staffed: true, active: true });
    expect(food.consumptionPerTick).toBe(2); // pop 2

    mustOk(applyCommand(state, {
      kind: "setBuildingActive",
      id: idOf(state, (b) => b.type === "well"),
      active: false,
    }));
    const water = getResourceContributors(state, "water");
    expect(water.producers).toHaveLength(1);
    expect(water.producers[0]).toMatchObject({ type: "well", active: false, staffed: false });
  });

  it("empty colony: no producers, zero consumption", () => {
    const state = freshState();
    stripToAnchor(state);
    state.population = 0;
    expect(getResourceContributors(state, "food")).toMatchObject({
      producers: [],
      consumptionPerTick: 0,
    });
  });
});

describe("logistics overlay (Step050)", () => {
  it("tints hubs ok and extraction sites by network distance, nothing else", () => {
    const state = freshState();
    stripToAnchor(state);
    state.world.blockedCells = {}; // subject under test is distance, not terrain
    state.resources.money = 100000;
    state.resources.planks = 50;
    mustOk(applyCommand(state, {
      kind: "placeRoads",
      cells: Array.from({ length: 14 }, (_, i) => cellKey(2 + i, 0)),
    }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "warehouse", x: 2, y: 1 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "lumberCamp", x: 3, y: 1 }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "lumberCamp", x: 15, y: 1 }));
    stepTicks(state, 2);
    const c = tints(state, "logistics");
    const anchor = Object.values(state.buildings).find((b) => b.type === "colonyCenter");
    const warehouse = Object.values(state.buildings).find((b) => b.type === "warehouse");
    if (!anchor || !warehouse) throw new Error("hub missing");
    expect(c.get(cellKey(anchor.x, anchor.y))).toBe("ok");
    expect(c.get(cellKey(warehouse.x, warehouse.y))).toBe("ok");
    expect(c.get(cellKey(3, 1))).toBe("ok"); // d=1 ≤ 12
    expect(c.get(cellKey(15, 1))).toBe("warn"); // d=13 → 96%
    expect(c.has(cellKey(0, 5))).toBe(false); // no other building type tints
  });
});
