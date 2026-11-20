import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { computeOverlay, type OverlayCell, type OverlayMode } from "@/renderer/overlay.js";
import { getResourceContributors } from "@/application/queries/analysis.js";
import { stockedState, freeCell, mustOk, stripToAnchor } from "./helpers.js";

const CONFIG = { seed: "overlay-test", width: 16, height: 16 };

function freshState(): GameState {
  return stockedState(CONFIG);
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



describe("food overlay mapping", () => {
  it("tints only the producing farm: ok, warn on deficit, off, and untinted otherwise", () => {
    const covered = staffedColony(); // farm 2 + trickle 1 = 3 vs 2 eaten → +1
    const t = tints(covered, "food");
    expect(t.get(cellKey(1, 0))).toBe("ok");
    expect(t.has(cellKey(1, 1))).toBe(false); // well
    expect(t.has(cellKey(1, 2))).toBe(false); // workshop
    // the loop below asserts a `false` per residence: it proves nothing if the
    // fixture quietly built none, so the count it walks is pinned first.
    expect(residences(covered)).toHaveLength(2);
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

});

