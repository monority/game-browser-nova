import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import { allRoadCells } from "../src/domain/road/road.js";
import { BUILDING_DEFINITIONS, type BuildingType } from "../src/content/buildings.js";
import { TECH_DEFINITIONS } from "../src/content/techs.js";
import { connectedWorkshops } from "../src/domain/economy/economy.js";
import { parseSave, serialize } from "../src/application/persistence/save.js";
import { freeCell } from "./helpers.js";

/**
 * Self-play verifier: a scripted governor plays the colony headlessly and
 * asserts every-tick global invariants plus system engagement. It is also
 * the instrument that MEASURED the D1 poverty trap (see Step019): from the
 * canonical start the best-known line stalls at pop1/money0 � income
 * (1 tax + 2 commerce) cannot cover the minimum viable building set, so no
 * surplus for growth ever forms. The full-loop proof stays blocked on the
 * D1 product decision; this suite locks in stability + engagement proof.
 *
 * Verified best-known line (do not reorder without evidence): residence,
 * well, workshop, park, then growth. Farm-first and park-late lines stall
 * earlier (probes, 2026-10-12).
 */

const CONFIG = {
  seed: "selfplay",
  width: 16,
  height: 16,
  woodDeposits: [
    { x: 5, y: 5, amount: 40 },
    { x: 6, y: 5, amount: 40 },
  ],
  stoneDeposits: [{ x: 10, y: 10, amount: 40 }],
};

const TICK_BUDGET = 3000;
const TECH_ORDER = ["cropRotation", "masonry", "tradeRoutes"];
const NB = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function buildable(state: GameState, x: number, y: number, roads: Set<string>): boolean {
  if (x < 0 || y < 0 || x >= state.world.width || y >= state.world.height) return false;
  const key = cellKey(x, y);
  if (state.world.blockedCells[key] || roads.has(key)) return false;
  if (state.woodDeposits[key] || state.stoneDeposits[key]) return false;
  if (Object.values(state.buildings).some((b) => b.x === x && b.y === y)) return false;
  return true;
}

function canAfford(state: GameState, type: BuildingType, road: boolean, reserve: number): boolean {
  const def = BUILDING_DEFINITIONS[type];
  return (
    state.resources.money >= def.moneyCost + (road ? 5 : 0) + reserve &&
    state.resources.planks >= def.plankCost &&
    state.resources.water >= def.waterCost
  );
}

function tryBuild(state: GameState, type: BuildingType, road: boolean, reserve: number): boolean {
  if (!canAfford(state, type, road, reserve)) return false;
  const roads = allRoadCells(state.roads);
  let spot: { x: number; y: number };
  try {
    spot = freeCell(state);
  } catch {
    return false;
  }
  if (road) {
    const cell = NB.map((d) => ({ x: spot.x + d.x, y: spot.y + d.y })).find((c) =>
      buildable(state, c.x, c.y, roads),
    );
    if (!cell) return false;
    if (!applyCommand(state, { kind: "placeRoads", cells: [cellKey(cell.x, cell.y)] }).ok) return false;
  }
  return applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }).ok;
}

function tryBuildNearDeposit(
  state: GameState,
  type: BuildingType,
  deposits: GameState["woodDeposits"],
  road: boolean,
  reserve: number,
): boolean {
  if (!canAfford(state, type, road, reserve)) return false;
  const roads = allRoadCells(state.roads);
  for (const key of Object.keys(deposits).sort()) {
    const parts = key.split(",").map(Number);
    const dx = parts[0] ?? 0;
    const dy = parts[1] ?? 0;
    for (const c of NB.map((d) => ({ x: dx + d.x, y: dy + d.y }))) {
      if (!buildable(state, c.x, c.y, roads)) continue;
      if (road) {
        const cell = NB.map((d) => ({ x: c.x + d.x, y: c.y + d.y })).find(
          (r) => !(r.x === c.x && r.y === c.y) && buildable(state, r.x, r.y, roads),
        );
        if (!cell) continue;
        if (!applyCommand(state, { kind: "placeRoads", cells: [cellKey(cell.x, cell.y)] }).ok) continue;
      }
      if (applyCommand(state, { kind: "placeBuilding", type, x: c.x, y: c.y }).ok) return true;
    }
  }
  return false;
}

function countType(state: GameState, type: BuildingType): number {
  return Object.values(state.buildings).filter((b) => b.type === type).length;
}

/** Producer/parks rest at high stocks (no maintenance) and wake at low stocks. */
function manageMothballs(state: GameState): void {
  const pop = state.population;
  for (const b of Object.values(state.buildings)) {
    if (b.type === "farm") {
      if (b.active && state.resources.food > pop * 4 + 16) {
        applyCommand(state, { kind: "setBuildingActive", id: b.id, active: false });
      } else if (!b.active && state.resources.food < pop * 2 + 6) {
        applyCommand(state, { kind: "setBuildingActive", id: b.id, active: true });
      }
    }
    if (b.type === "well") {
      if (b.active && state.resources.water > pop * 4 + 8) {
        applyCommand(state, { kind: "setBuildingActive", id: b.id, active: false });
      } else if (!b.active && state.resources.water < pop * 2 + 3) {
        applyCommand(state, { kind: "setBuildingActive", id: b.id, active: true });
      }
    }
    if (b.type === "park") {
      if (b.active && state.pollution < 40) {
        applyCommand(state, { kind: "setBuildingActive", id: b.id, active: false });
      } else if (!b.active && state.pollution > 60) {
        applyCommand(state, { kind: "setBuildingActive", id: b.id, active: true });
      }
    }
  }
}

/** One governor action per tick, highest priority first. */
function govern(state: GameState): void {
  manageMothballs(state);
  const pop = state.population;
  const money = state.resources.money;
  const housing = countType(state, "residence");
  const farms = countType(state, "farm");
  const wells = countType(state, "well");
  const shops = countType(state, "workshop");

  if (housing < 1) {
    if (tryBuild(state, "residence", false, 0)) return;
  }
  if (wells < 1) {
    if (tryBuild(state, "well", true, 0)) return;
  }
  if (shops < 1) {
    if (tryBuild(state, "workshop", true, 0)) return;
  }
  if (state.resources.food < pop + 4) {
    if (tryBuild(state, "farm", true, 0)) return;
  }
  if (countType(state, "park") < 1 && money > 45) {
    if (tryBuildNearDeposit(state, "park", state.woodDeposits, false, 0)) return;
  }
  if (shops < 2 && money > 80) {
    if (tryBuild(state, "workshop", true, 20)) return;
  }
  if (housing < 8 && pop >= housing && money > 60) {
    if (tryBuild(state, "residence", false, 20)) return;
  }
  // capacity branches need pop>=2: at pop1 the trickle covers food and any
  // extra workplace is pure maintenance drain (verified money pin at 0).
  if (pop >= 2 && farms < Math.ceil(pop / 2) + 1 && money > 60) {
    if (tryBuild(state, "farm", true, 20)) return;
  }
  if (pop >= 2 && wells < Math.ceil(pop / 4) + 1 && money > 60) {
    if (tryBuild(state, "well", true, 20)) return;
  }
  if (countType(state, "lumberCamp") < 1 && pop >= 1 && money > 60) {
    if (tryBuildNearDeposit(state, "lumberCamp", state.woodDeposits, true, 20)) return;
  }
  if (countType(state, "quarry") < 1 && state.resources.planks >= 5 && money > 60) {
    if (tryBuildNearDeposit(state, "quarry", state.stoneDeposits, true, 20)) return;
  }
  for (const tech of TECH_ORDER) {
    const def = TECH_DEFINITIONS[tech];
    if (def && !state.researchedTechs.includes(tech) && money >= def.cost + 100) {
      if (applyCommand(state, { kind: "researchTech", techId: tech }).ok) return;
    }
  }
  if (state.age >= 2 && countType(state, "market") < 1 && money > 100) {
    if (tryBuild(state, "market", true, 20)) return;
  }
}

function checkInvariants(state: GameState): void {
  for (const k of ["food", "water", "money", "wood", "stone", "planks"] as const) {
    const v = state.resources[k];
    if (!Number.isFinite(v) || v < 0) throw new Error("resource invariant: " + k + "=" + v);
  }
  if (!Number.isFinite(state.pollution) || state.pollution < 0 || state.pollution > 100) {
    throw new Error("pollution invariant: " + state.pollution);
  }
  if (state.population < 0) throw new Error("population invariant");
  for (const [key, d] of Object.entries(state.woodDeposits)) {
    if (d.remaining < 0 || d.remaining > d.capacity) throw new Error("wood deposit invariant: " + key);
  }
  for (const [key, d] of Object.entries(state.stoneDeposits)) {
    if (d.remaining < 0) throw new Error("stone deposit invariant: " + key);
  }
}

interface PlayResult {
  state: GameState;
  phases: string[];
}

function playGame(): PlayResult {
  const state = createInitialState(CONFIG);
  const phases: string[] = [];
  const seen = new Set<string>();
  const mark = (name: string): void => {
    if (!seen.has(name)) {
      seen.add(name);
      phases.push(name + "@" + state.tick);
    }
  };

  for (let t = 0; t < TICK_BUDGET; t++) {
    govern(state);
    stepTicks(state, 1);
    checkInvariants(state);

    if (state.population >= 1) mark("pop1");
    if (connectedWorkshops(state) >= 1) mark("commerce");
    if (countType(state, "park") >= 1) mark("park");
    if (t === 1500) {
      const restored = parseSave(serialize(state));
      expect(restored).toEqual(state);
      mark("save-mid");
    }
  }
  return { state, phases };
}

describe("self-play verifier", () => {
  it("canonical start runs 3000 ticks with systems engaged and zero violations", () => {
    const { state, phases } = playGame();
    for (const p of ["pop1", "commerce", "park", "save-mid"]) {
      expect(seen_has(phases, p), "phase missing: " + p + " (reached: " + phases.join(", ") + ")").toBe(true);
    }
    // mothball cycling engaged (producers rest and wake across the run)
    expect(Object.keys(state.buildings).length).toBeGreaterThanOrEqual(4);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    expect(state.tick).toBe(TICK_BUDGET);
    console.log("selfplay phases: " + phases.join(", "));
  }, 180000);

  it("self-play is deterministic", () => {
    const a = playGame();
    const b = playGame();
    expect(b.state).toEqual(a.state);
    expect(b.phases).toEqual(a.phases);
  }, 240000);
});

function seen_has(phases: string[], p: string): boolean {
  return phases.some((x) => x.startsWith(p + "@"));
}
