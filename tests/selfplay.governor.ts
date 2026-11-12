import { expect } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { allRoadCells } from "@/domain/road/road.js";
import { BUILDING_DEFINITIONS, type BuildingType } from "@/content/buildings.js";
import { foodPerFarm } from "@/domain/production/production.js";
import { TECH_DEFINITIONS } from "@/content/techs.js";
import { canAdvanceAge } from "@/domain/progression/progression.js";
import { foodCapacity, waterCapacity } from "@/domain/storage/storage.js";
import { parseSave, serialize } from "@/application/persistence/save.js";
import { freeCell, mustOk } from "./helpers.js";
import type { WorldConfig } from "@/domain/world/world.js";
import type { EventFrequency } from "@/domain/events/events.js";

/**
 * Self-play governor (Step021, extracted Step048): a scripted governor
 * plays the D2 day-0 colony headlessly through the full MVP loop -
 * Foundation surplus, Specialization techs, Age-1 milestones, transition,
 * Age-2 growth - asserting global invariants every tick. Shared by
 * selfplay.test.ts (gates) and measure.test.ts (Step048 trajectories).
 *
 * Step065: the Age-2 market (and the Step021 project mode that existed
 * only to afford its 2 planks) is gone with the market itself.
 *
 * Verified governor doctrine (do not reorder without evidence, Step020):
 * bank-to-400 before the tech run; workshops compound while banking;
 * emergency food builds only on structural (staffed-capacity) deficit;
 * priority lists must fall through on failure; triage rests water/wood/
 * stone getters (never commerce) when food runs thin.
 */

export const SELFPLAY_CONFIG = {
  seed: "selfplay",
  width: 16,
  height: 16,
  woodDeposits: [{ x: 5, y: 5, amount: 60 }],
  stoneDeposits: [{ x: 10, y: 10, amount: 60 }],
};

export const SELFPLAY_TICK_BUDGET = 1500;
export const TECH_ORDER = ["cropRotation", "masonry", "tradeRoutes"];

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
  const pop = state.population;
  // Water triage (Step065): with no market draining the granary, food sits
  // high, so the food triage below never fires and the workforce ends up in
  // workshops while the cistern empties. Rest industry first — it is the only
  // workplace that earns without keeping anyone alive — then revive it once
  // the cistern is comfortable again.
  const workshops = Object.values(state.buildings)
    .filter((b) => b.type === "workshop")
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (state.resources.water < pop) {
    for (const b of workshops) {
      if (b.active) applyCommand(state, { kind: "setBuildingActive", id: b.id, active: false });
    }
  } else if (state.resources.water > pop * 2) {
    for (const b of workshops) {
      if (!b.active) applyCommand(state, { kind: "setBuildingActive", id: b.id, active: true });
    }
  }
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

export function checkInvariants(state: GameState): void {
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

export function playGame(
  crisisAt = -1,
  stopEarly = true,
  housingCap = 14,
  growthCap?: number,
  events: false | EventFrequency = false,
  onTick?: (state: GameState) => void,
  config: WorldConfig = SELFPLAY_CONFIG,
): PlayResult {
  const state = createInitialState(config);
  if (events) {
    // Step047 guard: the documented governor doctrine must survive the
    // controlled events (frequent cursor = worst recurrence in budget).
    if (!applyCommand(state, { kind: "configureEvents", enabled: true, frequency: events }).ok) {
      throw new Error("events configuration failed");
    }
  }
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
    // Step035: scan free cells in canonical order for the first with a
    // buildable road neighbor. First-free-cell-only deadlocks permanently
    // once that cell's neighbors fill — a real player simply picks another
    // spot. Pairing rule: emergency farm builds stay capped (farmHeadroom)
    // so working placement cannot spam farms on exact-balance pinning.
    const skip = new Set<string>();
    for (;;) {
      let spot: { x: number; y: number };
      try {
        spot = freeCell(state, skip);
      } catch {
        return false;
      }
      if (!road) {
        return applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }).ok;
      }
      const cell = [
        { x: spot.x + 1, y: spot.y },
        { x: spot.x - 1, y: spot.y },
        { x: spot.x, y: spot.y + 1 },
        { x: spot.x, y: spot.y - 1 },
      ].find((c) => buildable(state, c.x, c.y, roads));
      if (!cell) {
        skip.add(cellKey(spot.x, spot.y));
        continue;
      }
      if (!applyCommand(state, { kind: "placeRoads", cells: [cellKey(cell.x, cell.y)] }).ok) return false;
      return applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }).ok;
    }
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

  for (let t = 0; t < SELFPLAY_TICK_BUDGET; t++) {
    if (t === crisisAt) {
      state.resources.money = 0;
      state.resources.food = 8;
    }
    const pop = state.population;
    const money = state.resources.money;
    const housing = countType(state, "residence");
    // Step035: phased housing cap — run the proven early path (Age 1 to
    // Age 2), then open growth. Undefined growthCap = legacy behavior.
    const capNow = growthCap !== undefined && seen.has("age2") ? growthCap : housingCap;
    manageMothballs(state);

    // Step031: storage pressure — a pinned stock means the surplus
  // engine outgrew capacity (farm rest thresholds and project buffers
  // assume headroom). The player answer is a warehouse; the governor
  // builds up to 4 (each +50/50, industry-gated via 2 planks).
  const foodPinned = state.resources.food >= foodCapacity(state) - 1;
  const waterPinned = state.resources.water >= waterCapacity(state) - 1;
  const staffedFarms = Object.values(state.buildings).filter((b) => b.type === "farm" && b.staffed).length;
    const structuralFoodGap = state.resources.food < pop + 4 && staffedFarms * 2 < pop;
    // Emergency farms respect the same staffing-ratio ceiling as normal
    // builds (Step035): above ceil(pop/2)+1 a new farm cannot be staffed
    // (workers are the constraint — Step022 triage doctrine) and only
    // adds upkeep. Without the cap, exact-balance pinning (food stuck
    // at 0 with production == consumption) spams farms forever once
    // placement works, diluting staffing until wells go dry.
    const farmHeadroom = countType(state, "farm") < Math.ceil(pop / 2) + 1;
    // Bank phase: at pop>=10 with a living colony, stop expanding and bank
    // 400 for the back-to-back tech run (tre200 must hold at advance).
    const banking = pop >= 10 && state.researchedTechs.length < 3 && money < 400;
    // Priority list, first SUCCESSFUL action wins the tick.
    const options: Array<[boolean, () => boolean]> = [
      [banking && structuralFoodGap && farmHeadroom, () => tryBuild("farm", true, 0)],
      [banking && countType(state, "workshop") < 2 && money > 50, () => tryBuild("workshop", true, 0)],
      [!banking && structuralFoodGap && farmHeadroom, () => tryBuild("farm", true, 0)],
      [!banking && state.researchedTechs.length < 3 && money >= 150, () => {
        for (const tech of TECH_ORDER) {
          const def = TECH_DEFINITIONS[tech];
          if (def && !state.researchedTechs.includes(tech) && applyCommand(state, { kind: "researchTech", techId: tech }).ok) return true;
        }
        return false;
      }],
      [!banking && countType(state, "workshop") < 4 && money > 50, () => tryBuild("workshop", true, 0)],
      [!banking && (foodPinned || waterPinned) && countType(state, "warehouse") < 4 && money > 60, () => tryBuild("warehouse", false, 20)],
      [!banking && housing < capNow && pop >= housing && money > 60, () => tryBuild("residence", false, 20)],
      [!banking && countType(state, "farm") < Math.ceil(pop / 2) + 1 && money > 60, () => tryBuild("farm", true, 20)],
      [!banking && countType(state, "well") < Math.ceil(pop / 2) + 1 && money > 60, () => tryBuild("well", true, 20)],
      [!banking && countType(state, "lumberCamp") < 1 && money > 60, () => tryBuildNearDeposit("lumberCamp", state.woodDeposits, true, 20)],
      [!banking && countType(state, "quarry") < 1 && state.resources.planks >= 5 && money > 60, () => tryBuildNearDeposit("quarry", state.stoneDeposits, true, 20)],
      [!banking && countType(state, "park") < 1 && (state.pollution > 25 || money > 200) && money > 60, () => tryBuildNearDeposit("park", state.woodDeposits, false, 20)],
    ];
    for (const [cond, fn] of options) {
      if (cond && fn()) break;
    }

    stepTicks(state, 1);
    checkInvariants(state);
    onTick?.(state);
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
    // Stop once the whole MVP loop is proven: Age 2 AND growth past the
    // opening's housing cap (pop 12). Stopping at age2 alone would cut the
    // run before the pop12 gate is observable (Step065).
    if (stopEarly && seen.has("pop12")) {
      const restored = parseSave(serialize(state));
      expect(restored).toEqual(state);
      mark("save-mid");
      break;
    }
  }
  return { state, phases, traj };
}
