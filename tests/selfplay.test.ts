import { describe, expect, it } from "vitest";
import { cellKey } from "../src/domain/shared/cells.js";
import { createInitialState, type GameState } from "../src/domain/simulation/state.js";
import { applyCommand } from "../src/domain/simulation/commands.js";
import { stepTicks } from "../src/domain/simulation/tick.js";
import { allRoadCells } from "../src/domain/road/road.js";
import { BUILDING_DEFINITIONS, type BuildingType } from "../src/content/buildings.js";
import { foodPerFarm } from "../src/domain/production/production.js";
import { TECH_DEFINITIONS } from "../src/content/techs.js";
import { canAdvanceAge, evaluateMilestones } from "../src/domain/progression/progression.js";
import { getColonyStats } from "../src/application/queries/stats.js";
import { parseSave, serialize } from "../src/application/persistence/save.js";
import { freeCell, mustOk } from "./helpers.js";

/**
 * Self-play verifier (Step021): a scripted governor plays the D2 day-0
 * colony headlessly through the full MVP loop - Foundation surplus,
 * Specialization techs, Age-1 milestones, transition, Age-2 market sales -
 * asserting phase gates plus global invariants every tick. Proves a clean
 * session completes the loop with no intervention (Phase 10 gate).
 *
 * Verified governor doctrine (do not reorder without evidence, Step020):
 * bank-to-400 before the tech run; workshops compound while banking;
 * emergency food builds only on structural (staffed-capacity) deficit;
 * priority lists must fall through on failure; triage rests water/wood/
 * stone getters (never commerce) when food runs thin.
 */

const CONFIG = {
  seed: "selfplay",
  width: 16,
  height: 16,
  woodDeposits: [{ x: 5, y: 5, amount: 60 }],
  stoneDeposits: [{ x: 10, y: 10, amount: 60 }],
};

const TICK_BUDGET = 1500;
const TECH_ORDER = ["cropRotation", "masonry", "tradeRoutes"];

function buildable(state: GameState, x: number, y: number, roads: Set<string>): boolean {
  if (x < 0 || y < 0 || x >= state.world.width || y >= state.world.height) return false;
  const key = cellKey(x, y);
  if (state.world.blockedCells[key] || roads.has(key)) return false;
  if (state.woodDeposits[key] || state.stoneDeposits[key]) return false;
  if (Object.values(state.buildings).some((b) => b.x === x && b.y === y)) return false;
  return true;
}

function countType(state: GameState, type: BuildingType): number {
  return Object.values(state.buildings).filter((b) => b.type === type).length;
}

/** Producer/parks rest at high stocks (no maintenance) and wake at low stocks. */
function manageMothballs(state: GameState): void {
  if (projectModeActive(state)) {
    runProjectMode(state);
    return;
  }
  const pop = state.population;
  for (const b of Object.values(state.buildings)) {
    // Food triage first: rest water/wood/stone getters so workers flow
    // deterministically to farms next tick. Workshops keep earning and
    // parks keep absorbing; water shortage pauses admission but never kills.
    if (state.resources.food < pop + 4 && (b.type === "well" || b.type === "lumberCamp" || b.type === "quarry")) {
      if (b.active) applyCommand(state, { kind: "setBuildingActive", id: b.id, active: false });
      continue;
    }
    // Yield-tech slack (Step021): researched farm yield covers pop with fewer
    // farms; resting the surplus frees workers for wells (water surplus =
    // admission resumes) and camps (wood chain). Rest latest-built first:
    // they sort last and would sit unstaffed anyway.
    const farmYield = foodPerFarm(state);
    const farmsNeeded = Math.max(1, Math.ceil(pop / farmYield));
    const activeFarms = Object.values(state.buildings)
      .filter((f) => f.type === "farm" && f.active)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (activeFarms.length > farmsNeeded) {
      for (const f of activeFarms.slice(farmsNeeded)) {
        applyCommand(state, { kind: "setBuildingActive", id: f.id, active: false });
      }
    } else if (activeFarms.length < farmsNeeded) {
      const resting = Object.values(state.buildings)
        .filter((f) => f.type === "farm" && !f.active)
        .sort((a, b) => a.y - b.y || a.x - b.x);
      for (const f of resting.slice(0, farmsNeeded - activeFarms.length)) {
        applyCommand(state, { kind: "setBuildingActive", id: f.id, active: true });
      }
    }
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

/**
 * Project mode (Step021): to build the Age-2 market the colony needs 2
 * planks = 1 staffed camp-tick + staffed workshop transform ticks. Staffing
 * is greedy over sort order, so the governor mothballs down to
 * eligible <= workers: then EVERYONE staffed, deterministically, whatever
 * the order. Enters only with food/water buffers for the ~4-tick project;
 * exits by building the market (caller reactivates shops after).
 */
function projectModeActive(state: GameState): boolean {
  const pop = state.population;
  return (
    state.age >= 2 &&
    countType(state, "market") < 1 &&
    state.resources.planks < 2 &&
    pop >= 10 &&
    state.resources.food > pop * 5 &&
    state.resources.water > 20
  );
}

function runProjectMode(state: GameState): void {
  const byType = (t: BuildingType) =>
    Object.values(state.buildings)
      .filter((b) => b.type === t)
      .sort((a, b) => a.y - b.y || a.x - b.x);
  const keep = (t: BuildingType, n: number): void => {
    const list = byType(t);
    for (const b of list.slice(0, n)) {
      if (!b.active) applyCommand(state, { kind: "setBuildingActive", id: b.id, active: true });
    }
    for (const b of list.slice(n)) {
      if (b.active) applyCommand(state, { kind: "setBuildingActive", id: b.id, active: false });
    }
  };
  // 4 farms (12 food w/ tech) + 4 wells (8 water, buffered) + camp + shop:
  // 10 eligible <= pop 10 charges the whole chain deterministically.
  keep("farm", 4);
  keep("well", 4);
  keep("lumberCamp", 1);
  keep("workshop", 1);
  keep("quarry", 0);
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
  traj: string[];
}

function playGame(crisisAt = -1, stopEarly = true, housingCap = 14): PlayResult {
  const state = createInitialState(CONFIG);
  const phases: string[] = [];
  const seen = new Set<string>();
  const traj: string[] = [];
  const mark = (name: string): void => {
    if (!seen.has(name)) {
      seen.add(name);
      phases.push(name + "@" + state.tick);
    }
  };

  const tryBuild = (type: BuildingType, road: boolean, reserve: number): boolean => {
    const def = BUILDING_DEFINITIONS[type];
    if (state.resources.money < def.moneyCost + (road ? 5 : 0) + reserve) return false;
    if (state.resources.planks < def.plankCost || state.resources.water < def.waterCost) return false;
    const roads = allRoadCells(state.roads);
    let spot: { x: number; y: number };
    try {
      spot = freeCell(state);
    } catch {
      return false;
    }
    if (road) {
      const cell = [
        { x: spot.x + 1, y: spot.y },
        { x: spot.x - 1, y: spot.y },
        { x: spot.x, y: spot.y + 1 },
        { x: spot.x, y: spot.y - 1 },
      ].find((c) => buildable(state, c.x, c.y, roads));
      if (!cell) return false;
      if (!applyCommand(state, { kind: "placeRoads", cells: [cellKey(cell.x, cell.y)] }).ok) return false;
    }
    return applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }).ok;
  };

  const tryBuildNearDeposit = (
    type: BuildingType,
    deposits: GameState["woodDeposits"],
    road: boolean,
    reserve: number,
  ): boolean => {
    const def = BUILDING_DEFINITIONS[type];
    if (state.resources.money < def.moneyCost + (road ? 5 : 0) + reserve) return false;
    if (state.resources.planks < def.plankCost || state.resources.water < def.waterCost) return false;
    const roads = allRoadCells(state.roads);
    for (const key of Object.keys(deposits).sort()) {
      const parts = key.split(",").map(Number);
      const dx = parts[0] ?? 0;
      const dy = parts[1] ?? 0;
      for (const c of [
        { x: dx + 1, y: dy },
        { x: dx - 1, y: dy },
        { x: dx, y: dy + 1 },
        { x: dx, y: dy - 1 },
      ]) {
        if (!buildable(state, c.x, c.y, roads)) continue;
        if (road) {
          const cell = [
            { x: c.x + 1, y: c.y },
            { x: c.x - 1, y: c.y },
            { x: c.x, y: c.y + 1 },
            { x: c.x, y: c.y - 1 },
          ].find((r) => !(r.x === c.x && r.y === c.y) && buildable(state, r.x, r.y, roads));
          if (!cell) continue;
          if (!applyCommand(state, { kind: "placeRoads", cells: [cellKey(cell.x, cell.y)] }).ok) continue;
        }
        if (applyCommand(state, { kind: "placeBuilding", type, x: c.x, y: c.y }).ok) return true;
      }
    }
    return false;
  };

  for (let t = 0; t < TICK_BUDGET; t++) {
    if (t === crisisAt) {
      state.resources.money = 0;
      state.resources.food = 8;
    }
    const pop = state.population;
    const money = state.resources.money;
    const housing = countType(state, "residence");
    manageMothballs(state);

    const staffedFarms = Object.values(state.buildings).filter((b) => b.type === "farm" && b.staffed).length;
    const structuralFoodGap = state.resources.food < pop + 4 && staffedFarms * 2 < pop;
    // Bank phase: at pop>=10 with a living colony, stop expanding and bank
    // 400 for the back-to-back tech run (tre200 must hold at advance).
    const banking = pop >= 10 && state.researchedTechs.length < 3 && money < 400;
    // Priority list, first SUCCESSFUL action wins the tick.
    const options: Array<[boolean, () => boolean]> = [
      [banking && structuralFoodGap, () => tryBuild("farm", true, 0)],
      [banking && countType(state, "workshop") < 2 && money > 50, () => tryBuild("workshop", true, 0)],
      [!banking && structuralFoodGap, () => tryBuild("farm", true, 0)],
      [!banking && state.researchedTechs.length < 3 && money >= 150, () => {
        for (const tech of TECH_ORDER) {
          const def = TECH_DEFINITIONS[tech];
          if (def && !state.researchedTechs.includes(tech) && applyCommand(state, { kind: "researchTech", techId: tech }).ok) return true;
        }
        return false;
      }],
      [!banking && countType(state, "workshop") < 4 && money > 50, () => tryBuild("workshop", true, 0)],
      [!banking && housing < housingCap && pop >= housing && money > 60, () => tryBuild("residence", false, 20)],
      [!banking && countType(state, "farm") < Math.ceil(pop / 2) + 1 && money > 60, () => tryBuild("farm", true, 20)],
      [!banking && countType(state, "well") < Math.ceil(pop / 2) + 1 && money > 60, () => tryBuild("well", true, 20)],
      [!banking && countType(state, "lumberCamp") < 1 && money > 60, () => tryBuildNearDeposit("lumberCamp", state.woodDeposits, true, 20)],
      [!banking && countType(state, "quarry") < 1 && state.resources.planks >= 5 && money > 60, () => tryBuildNearDeposit("quarry", state.stoneDeposits, true, 20)],
      [!banking && countType(state, "park") < 1 && (state.pollution > 25 || money > 200) && money > 60, () => tryBuildNearDeposit("park", state.woodDeposits, false, 20)],
      [state.age >= 2 && countType(state, "market") < 1 && money > 100, () => tryBuild("market", true, 20)],
    ];
    for (const [cond, fn] of options) {
      if (cond && fn()) break;
    }

    stepTicks(state, 1);
    checkInvariants(state);
    if (state.tick % 150 === 0 || state.tick <= 6) {
      traj.push(
        `t${state.tick} pop${state.population} money${Math.floor(state.resources.money)} ` +
        `food${Math.floor(state.resources.food)} water${Math.floor(state.resources.water)} ` +
        `wood${Math.floor(state.resources.wood)} planks${Math.floor(state.resources.planks)} ` +
        `shops${countType(state, "workshop")} techs${state.researchedTechs.length} age${state.age} bldgs${Object.keys(state.buildings).length}`,
      );
    }

    if (state.population >= 12) mark("pop12");
    if (canAdvanceAge(state) && state.age === 1) {
      mark("ready");
      mustOk(applyCommand(state, { kind: "advanceAge" }));
      mark("age2");
      const restored = parseSave(serialize(state));
      expect(restored).toEqual(state);
    }
    if (state.age >= 2 && countType(state, "market") >= 1) mark("market-built");
    if (state.age >= 2 && getColonyStats(state).marketPerTick > 0) mark("market-sale");
    if (stopEarly && seen.has("market-sale")) {
      const restored = parseSave(serialize(state));
      expect(restored).toEqual(state);
      mark("save-mid");
      break;
    }
  }
  return { state, phases, traj };
}

describe("self-play verifier", () => {
  it("plays the full MVP loop to Age 2 with no intervention", () => {
    const { state, phases, traj } = playGame();
    for (const p of ["pop12", "ready", "age2", "market-built", "market-sale", "save-mid"]) {
      expect(phases.some((x) => x.startsWith(p + "@")), "phase missing: " + p + " (reached: " + phases.join(", ") + ")").toBe(true);
    }
    expect(state.age).toBe(2);
    expect(evaluateMilestones(state, 2).length).toBe(4);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("selfplay phases: " + phases.join(", "));
    console.log("selfplay trajectory:\n" + traj.join("\n"));
  }, 180000);

  it("recovers from a money-zero crisis without injection", () => {
    // crisis lands mid-game (treasury 0 + food 8: the established Step009
    // scenario, no injection after setup); the run continues full-budget.
    const { state, phases } = playGame(300, false);
    expect(state.population).toBeGreaterThanOrEqual(10);
    expect(state.resources.money).toBeGreaterThanOrEqual(200);
    expect(phases.some((x) => x.startsWith("age2@"))).toBe(true);
    console.log("crisis phases: " + phases.join(", "));
  }, 180000);

  it("sustains growth beyond pop 12 with water holding (Step022)", () => {
    // Regression: growth follows housing construction; staffed well
    // capacity (wells ratio + cropRotation slack + mothball cycling)
    // keeps water in surplus. Fails if admission water-locks.
    const { state, phases } = playGame(-1, false, 24);
    expect(state.population).toBeGreaterThanOrEqual(20);
    expect(state.resources.water).toBeGreaterThan(0);
    expect(phases.some((x) => x.startsWith("pop12@"))).toBe(true);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("sustained phases: " + phases.join(", "));
  }, 180000);

  it("self-play is deterministic", () => {
    const a = playGame();
    const b = playGame();
    expect(b.state).toEqual(a.state);
    expect(b.phases).toEqual(a.phases);
  }, 240000);
});
