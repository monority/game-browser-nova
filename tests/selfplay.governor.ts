import { expect } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { allRoadCells } from "@/domain/road/road.js";
import { BUILDING_DEFINITIONS, type BuildingType } from "@/content/buildings.js";
import { foodProductionPerTick } from "@/domain/production/production.js";
import { TECH_DEFINITIONS } from "@/content/techs.js";
import { canAdvanceAge } from "@/domain/progression/progression.js";
import { foodCapacity, waterCapacity } from "@/domain/storage/storage.js";
import { planFoodReserve } from "@/domain/storage/reserve.js";
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
 *
 * Step068: food is sized by the reserve doctrine, not by the exact balance.
 * Step056's `ceil(pop / yield)` leaves no margin, and with the 3%/tick
 * conservation of Step067 its fixed point is zero — the colony then lives on
 * the starvation boundary (one death and one admission per tick, permanently
 * unfed). `planFoodReserve` (src/domain/storage/reserve.ts) answers the
 * question instead: farms for a reserve of FOOD_RESERVE_TICKS of consumption,
 * capped by the granary, and the triage floor is expressed in the same ticks.
 */

export const SELFPLAY_CONFIG = {
  seed: "selfplay",
  width: 16,
  height: 16,
  woodDeposits: [{ x: 5, y: 5, amount: 60 }],
  stoneDeposits: [{ x: 10, y: 10, amount: 60 }],
};

export const SELFPLAY_TICK_BUDGET = 1500;
/**
 * Research order for the automated player (Step071). The three Age-1 techs
 * come first because the Age-1 gate needs three, then the rest of the catalog
 * as money allows — including the two Age-3 sinks, so a run that reaches Age 3
 * actually spends the treasury instead of hoarding it. This is the harness's
 * player policy, not a game rule: the catalog is read from content.
 */
export const TECH_ORDER = [
  "cropRotation",
  "masonry",
  "tradeRoutes",
  "irrigation",
  "deepMining",
  "wheelbarrow",
  "cobbledRoads",
  "winterWheat",
];

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
  // Step085 (measured 2026-11-17): the band below cannot wake industry in the
  // healthy regime, and the posture it leaves behind is DOMINATED. The growing
  // line ends with all 4 workshops dormant from t≈400 with commerce 0, on
  // +4/tick and pollution 37 — not because they are off the road (4/4 are
  // adjacent to a road, 71 road cells) but because the cistern never holds
  // `pop * 2` water once production equals consumption (86 for 86 mouths, the
  // stock living at 0-1). Waking them at t=1500 costs no water (production
  // stays 86, pressure 0, no well loses its worker: staffed 66 → 70) and pays
  // +12/tick, but pollutes to 100 because the parks are asleep on their own
  // band; waking both is stable at +9/tick with pollution 0 (57 → 1894 in 200
  // ticks, planks 38 until the wood runs out). The other bands were swept and
  // are dead but harmless (wells never rest, parks cannot wake while nothing
  // emits, the food triage rest frees an already-idle worker at pop 86). Left
  // unchanged on purpose:
  // which posture the colony ends in is a design call, measured both ways in
  // docs/STATE.md.
  const reserve = planFoodReserve(state);
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
  // Reserve doctrine (Step068): the farm count is whatever holds the target
  // reserve, so there is no separate "rest a farm when food is high" rule any
  // more — at 3%/tick stock and production are coupled, and two thresholds
  // fighting each other would toggle farms every tick.
  const activeFarms = Object.values(state.buildings)
    .filter((f) => f.type === "farm" && f.active)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (activeFarms.length > reserve.farms) {
    for (const f of activeFarms.slice(reserve.farms)) {
      applyCommand(state, { kind: "setBuildingActive", id: f.id, active: false });
    }
  } else if (activeFarms.length < reserve.farms) {
    const resting = Object.values(state.buildings)
      .filter((f) => f.type === "farm" && !f.active)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const f of resting.slice(0, reserve.farms - activeFarms.length)) {
      applyCommand(state, { kind: "setBuildingActive", id: f.id, active: true });
    }
  }
  for (const b of Object.values(state.buildings)) {
    // Food triage first: rest wood/stone getters so workers flow
    // deterministically to farms next tick. Workshops keep earning and
    // parks keep absorbing.
    // The floor is ticks of consumption (Step068), not the old `pop + 4`
    // offset, which meant a different autonomy at every population.
    //
    // WELLS ARE OUT (Step084, measured 2026-11-17). This rule was written when
    // its own comment could say "water shortage pauses admission but never
    // kills": because of that, it rested wells too, and the workforce went to
    // the farms. Steps 078-082 changed the price of a dry cistern (pressure,
    // crisis bills, departures), and the rule also disarmed Step081's reserve
    // — an inactive well is not an eligible workplace, so the reserve has
    // nothing to staff. Measured on the growing line (housing 240, growth 86):
    // at t=1500 food 80 sat under a floor of pop 53 x 2 = 106, all 29 wells
    // were rested, water production fell to 0, pressure reached 100 and 53
    // colonists went unserved while the treasury was drained by the bill. A
    // colony short of food still has to drink, so wells follow the water band
    // below, which already rests them above `pop * 4 + 8`.
    if (state.resources.food < reserve.triageFloor && (b.type === "lumberCamp" || b.type === "quarry")) {
      if (b.active) applyCommand(state, { kind: "setBuildingActive", id: b.id, active: false });
      continue;
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
    // Step068: the reserve plan also answers the storage question — when the
    // target reserve does not fit the granary, storage is a food decision.
    const reserve = planFoodReserve(state);
    const foodBelowNeed = foodProductionPerTick(state) < pop;
    const structuralFoodGap = state.resources.food < reserve.triageFloor && foodBelowNeed;
    // Emergency farms respect the same staffing-ratio ceiling as normal
    // builds (Step035): above ceil(pop/2)+1 a new farm cannot be staffed
    // (workers are the constraint — Step022 triage doctrine) and only
    // adds upkeep. Without the cap, exact-balance pinning (food stuck
    // at 0 with production == consumption) spams farms forever once
    // placement works, diluting staffing until wells go dry.
    const farmHeadroom =
      countType(state, "farm") < reserve.farms &&
      // staffing ceiling kept from Step035: above one farm per two colonists
      // a new farm cannot be staffed (workers are the constraint) and only
      // adds upkeep.
      countType(state, "farm") < Math.ceil(pop / 2) + 1;
    // Bank phase: at pop>=10 with a living colony, stop expanding and bank
    // 400 for the back-to-back tech run (tre200 must hold at advance).
    const banking = pop >= 10 && state.researchedTechs.length < 3 && money < 400;
    // Priority list, first SUCCESSFUL action wins the tick.
    const options: Array<[boolean, () => boolean]> = [
      [banking && structuralFoodGap && farmHeadroom, () => tryBuild("farm", true, 0)],
      [banking && countType(state, "workshop") < 2 && money > 50, () => tryBuild("workshop", true, 0)],
      [!banking && structuralFoodGap && farmHeadroom, () => tryBuild("farm", true, 0)],
      [
        !banking,
        () => {
          for (const tech of TECH_ORDER) {
            const def = TECH_DEFINITIONS[tech];
            if (!def || state.researchedTechs.includes(tech)) continue;              // Age still gates a technology, and the player keeps a building
              // budget: research comes after the warehouses and farms it can
              // still afford (measured: a 40-unit buffer spent the granary's
              // warehouse and left the endgame granary 7 units under target).
              if (def.age > state.age || state.resources.money < def.cost + 200) continue;
            if (applyCommand(state, { kind: "researchTech", techId: tech }).ok) return true;
          }
          return false;
        },
      ],
      [!banking && countType(state, "workshop") < 4 && money > 50, () => tryBuild("workshop", true, 0)],
      [
        !banking &&
          (foodPinned || waterPinned || (reserve.capacityShort && reserve.autonomy < reserve.targetTicks * 0.8)) &&
          countType(state, "warehouse") < 4 &&
          money > 60,
        () => tryBuild("warehouse", false, 20),
      ],
      [!banking && housing < capNow && pop >= housing && money > 60, () => tryBuild("residence", false, 20)],
      [!banking && countType(state, "farm") < reserve.farms && money > 60, () => tryBuild("farm", true, 20)],
      [!banking && countType(state, "well") < Math.ceil(pop / 2) + 1 && money > 60, () => tryBuild("well", true, 20)],
      [!banking && countType(state, "lumberCamp") < 1 && money > 60, () => tryBuildNearDeposit("lumberCamp", state.woodDeposits, true, 20)],
      [!banking && countType(state, "quarry") < 1 && state.resources.planks >= 5 && money > 60, () => tryBuildNearDeposit("quarry", state.stoneDeposits, true, 20)],
      // Step074: up to three parks. One was enough while growth stopped at
      // pop 24 for other reasons; with housing open the measured blocker is
      // air quality itself (quality 21 against the admission gate of 25,
      // pollution 79), so a single park left a big settlement unable to grow.
      [!banking && countType(state, "park") < 3 && (state.pollution > 25 || money > 200) && money > 60, () => tryBuildNearDeposit("park", state.woodDeposits, false, 20)],
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
