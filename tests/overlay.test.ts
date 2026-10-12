import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import { computeOverlay, type OverlayCell } from "../src/renderer/overlay.js";
import { getResourceContributors } from "../src/application/queries/analysis.js";
import { freeCell, mustOk } from "./helpers.js";

const CONFIG = { seed: "overlay-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

/** Road (0,0) + farm (1,0) + well (1,1) + workshop (1,2) + 2 residences, matured, pop 2. */
function staffedColony(): GameState {
  const state = freshState();
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

function tints(state: GameState, mode: "staffing" | "deposits" | "none"): Map<string, string> {
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
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: "building-1", active: false }));
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
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: "building-2", active: false }));
    const c = getResourceContributors(state, "water");
    expect(c.producers.length).toBe(1);
    expect(c.producers[0]).toMatchObject({ type: "well", active: false, staffed: false });
  });

  it("empty colony: no producers, zero consumption", () => {
    const state = freshState();
    const c = getResourceContributors(state, "food");
    expect(c.producers).toEqual([]);
    expect(c.consumptionPerTick).toBe(0);
  });
});
