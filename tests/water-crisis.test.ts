import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { allRoadCells } from "@/domain/road/road.js";
import { type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepSimulation, stepTicks } from "@/domain/simulation/tick.js";
import {
  assignJobs,
  ordinaryWaterCapacity,
  updateWaterReserveLatch,
  waterWorkerReserve,
} from "@/domain/jobs/jobs.js";
import {
  foodProductionPerTick,
  waterProductionPerTick,
} from "@/domain/production/production.js";
import {
  parseSave,
  parseSaveString,
  saveToString,
  serialize,
} from "@/application/persistence/save.js";
import { getColonyStats } from "@/application/queries/stats.js";
import { getAlerts } from "@/application/queries/analysis.js";
import {
  housingCapacity,
  ticksUntilWaterDeparture,
  waterDepartureDue,
} from "@/domain/population/population.js";
import {
  WATER_DEPARTURE_INTERVAL_TICKS,
  WATER_DEPARTURE_POPULATION_FLOOR,
  WATER_PRESSURE_GRAVE_THRESHOLD,
  waterEmergencyCost,
} from "@/domain/water/water.js";
import {
  MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK,
  TAX_PER_INHABITANT_PER_TICK,
  maintenancePerTick,
  taxesPerTick,
  waterEmergencyCostPerTick,
} from "@/domain/economy/economy.js";
import { stockedState, adjacentFree, freeCell, mustOk, stripToAnchor } from "./helpers.js";

/**
 * Step079 — the consequences of a prolonged hydric crisis, on the tick's own
 * integers. Two rules: the emergency bill from pressure 75 (one coin per
 * colonist the tick could not serve) and one departure every ten ticks at the
 * maximum, with a floor of two colonists.
 *
 * The anchor-only colony keeps the money arithmetic legible: no upkeep to pay,
 * no commerce, no housing, so a tick's money delta is exactly `taxes − bill`.
 */

const CONFIG = { seed: "water-crisis-test", width: 16, height: 16 };

/** Anchor-only colony with no wells: the tick serves exactly the stock. */
function crisisState(population: number, water: number): GameState {
  const state = stockedState(CONFIG);
  stripToAnchor(state);
  state.population = population;
  state.resources.food = 1000;
  state.resources.water = water;
  state.resources.money = 100;
  return state;
}

/**
 * Isolation detail: these rules are about THIRST, so the granary is restocked
 * before every tick. Otherwise the base storage cap (which trims the 1 000 down
 * to a few dozen) plus starvation removes colonists of its own and the test
 * would measure hunger while claiming to measure water. Food is pinned to a
 * value the clamp trims anyway, so the trajectory stays deterministic.
 */
function stepWater(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    state.resources.food = 1000;
    stepSimulation(state);
  }
}

describe("emergency water bill (rule A)", () => {
  it("charges one coin per unserved colonist, and only from pressure 75", () => {
    expect(waterEmergencyCost(0, 10)).toBe(0);
    expect(waterEmergencyCost(74, 4)).toBe(0);
    expect(waterEmergencyCost(WATER_PRESSURE_GRAVE_THRESHOLD, 4)).toBe(4);
    expect(waterEmergencyCost(75, 1)).toBe(1);
    expect(waterEmergencyCost(100, 10)).toBe(10);
    // nobody thirsty is no bill, whatever the gauge says.
    expect(waterEmergencyCost(90, 0)).toBe(0);
    expect(waterEmergencyCost(90, -3)).toBe(0);
  });

  it("leaves the money untouched below 75, even with a thirsty colonist", () => {
    // 9 served of 10 = 90 %, a light deficit: the gauge holds at 74.
    const state = crisisState(10, 9);
    state.waterPressure = 74;
    expect(getColonyStats(state).waterUnserved).toBe(1);
    expect(waterEmergencyCostPerTick(state)).toBe(0); // 1 thirsty, below the band
    stepWater(state, 1);
    expect(state.waterPressure).toBe(74);
    expect(state.resources.money).toBe(110); // taxes 10, no bill
    expect(waterEmergencyCostPerTick(state)).toBe(0); // now dry, still below 75
  });

  it("bills the same colony from 75, at the tick's own shortfall", () => {
    const state = crisisState(10, 9);
    state.waterPressure = 75;
    stepWater(state, 1);
    expect(state.resources.money).toBe(109); // taxes 10 − 1 unserved
  });

  it("bills four colonists at 4/tick and keeps the gauge rising", () => {
    const state = crisisState(10, 6);
    state.waterPressure = 90;
    stepWater(state, 1);
    expect(state.resources.money).toBe(106); // 100 + 10 − 4
    expect(state.waterPressure).toBe(91); // 60 % covers: severe, +1
  });

  it("stops at the very tick coverage is complete, whatever the gauge says", () => {
    const state = crisisState(10, 50);
    state.waterPressure = 90;
    stepWater(state, 1);
    expect(state.resources.money).toBe(110); // nobody unserved: no bill
    expect(state.waterPressure).toBe(89); // the gauge still recovers 1/tick
  });

  it("never produces a negative treasury or a debt", () => {
    // 16 colonists pay 16 taxes and owe 16 in water, plus 1 of crowding:
    // the net deficit is real, the treasury stops at zero.
    const state = crisisState(16, 0);
    state.resources.money = 0;
    state.waterPressure = 95;
    for (let i = 0; i < 10; i++) {
      stepWater(state, 1);
      expect(state.resources.money).toBeGreaterThanOrEqual(0);
    }
    expect(state.resources.money).toBe(0);
    expect(getColonyStats(state).netMoneyPerTick).toBeLessThan(0);
  });

  it("keeps taxes and maintenance exactly as they were", () => {
    expect(TAX_PER_INHABITANT_PER_TICK).toBe(1);
    expect(MAINTENANCE_PER_OPERATIONAL_BUILDING_PER_TICK).toBe(1);
    const state = crisisState(10, 0);
    state.waterPressure = 90;
    expect(taxesPerTick(state)).toBe(10);
    expect(maintenancePerTick(state)).toBe(0);
    expect(getColonyStats(state).taxesPerTick).toBe(10);
  });

  it("re-bills from the first tick a reactivated well actually produces", () => {
    const state = crisisState(10, 0);
    const road = freeCell(state);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    const spot = adjacentFree(state, road.x, road.y);
    mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x: spot.x, y: spot.y }));
    stepWater(state, 2); // operational, and staffed by the end of the second tick
    state.resources.money = 1000; // the two construction ticks earned their own taxes

    const well = Object.values(state.buildings).find((b) => b.type === "well");
    if (!well) throw new Error("expected a well");
    state.resources.water = 0;
    state.waterPressure = 90;
    expect(waterEmergencyCostPerTick(state)).toBe(8); // 2 served of 10

    // active: taxes 10 − upkeep 1 − bill 8
    stepWater(state, 1);
    expect(state.resources.money).toBe(1001);

    // mothballed: no upkeep, no water, bill 10
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: well.id, active: false }));
    stepWater(state, 1);
    expect(state.resources.money).toBe(1001 + 10 - 10);

    // reactivated: staffing is assigned at the END of this tick, so the well
    // still produces nothing — the bill stays at the full 10
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: well.id, active: true }));
    state.resources.water = 0;
    stepWater(state, 1);
    expect(state.resources.money).toBe(1001 - 1); // taxes 10 − upkeep 1 − bill 10

    // and from the next tick it serves 2 colonists: bill 8
    stepWater(state, 1);
    expect(state.resources.money).toBe(1001 - 1 + 1); // taxes 10 − upkeep 1 − bill 8
  });
});

describe("hydric departures (rules C–E)", () => {
  it("needs the gauge at its maximum, a mature counter and a colony above the floor", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 99;
    state.waterCrisisTicks = 9;
    expect(waterDepartureDue(state)).toBe(false);
    // the counter alone is not enough: the gauge must still be critical.
    state.waterPressure = 100;
    state.waterCrisisTicks = 9;
    expect(waterDepartureDue(state)).toBe(false);
    state.waterCrisisTicks = WATER_DEPARTURE_INTERVAL_TICKS;
    expect(waterDepartureDue(state)).toBe(true);
    state.population = WATER_DEPARTURE_POPULATION_FLOOR;
    expect(waterDepartureDue(state)).toBe(false); // floor reached
  });

  it("resets the counter at 99 and never departs", () => {
    const state = crisisState(10, 9); // 90 %: the gauge holds
    state.waterPressure = 99;
    state.waterCrisisTicks = 9;
    stepWater(state, 1);
    expect(state.waterPressure).toBe(99);
    expect(state.waterCrisisTicks).toBe(0); // one tick below the maximum
    expect(state.population).toBe(10);
  });

  it("removes exactly one colonist every ten ticks, never two in a tick", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 100;
    stepWater(state, 9);
    expect(state.population).toBe(10);
    stepWater(state, 1); // tick 10
    expect(state.population).toBe(9);
    stepWater(state, 9);
    expect(state.population).toBe(9);
    stepWater(state, 1); // tick 20
    expect(state.population).toBe(8);
  });

  it("stops immediately when the gauge drops below its maximum", () => {
    const state = crisisState(10, 50);
    state.tick = 9;
    state.waterPressure = 99; // full coverage: the gauge falls instead of rising
    stepWater(state, 1);
    expect(state.tick).toBe(10);
    expect(state.waterPressure).toBe(98);
    expect(state.population).toBe(10);
  });

  it("stops at two colonists and keeps the simulation valid", () => {
    const state = crisisState(2, 0);
    state.waterPressure = 100;
    stepWater(state, 40);
    expect(state.population).toBe(WATER_DEPARTURE_POPULATION_FLOOR);
    expect(state.waterPressure).toBe(100);
    expect(Number.isFinite(state.resources.money)).toBe(true);
  });

  it("does not grow a colony while the shortage lasts", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 100;
    stepWater(state, 20);
    expect(state.population).toBe(8); // only departures, no admission
  });

  it("recalculates the need on the smaller colony", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 100;
    stepWater(state, 10);
    expect(state.population).toBe(9);
    expect(getColonyStats(state).waterUnserved).toBe(9);
    expect(ticksUntilWaterDeparture(state)).toBe(WATER_DEPARTURE_INTERVAL_TICKS);
  });
});

describe("determinism and persistence (rule D)", () => {
  it("is bit-identical across two identical runs", () => {
    const a = crisisState(10, 0);
    const b = crisisState(10, 0);
    a.waterPressure = 95;
    b.waterPressure = 95;
    stepWater(a, 40);
    stepWater(b, 40);
    expect(a.population).toBe(b.population);
    expect(saveToString(a)).toBe(saveToString(b));
  });

  it("keeps the departure phase across a save taken mid-cadence", () => {
    const straight = crisisState(10, 0);
    straight.waterPressure = 100;
    stepWater(straight, 20);

    const saved = crisisState(10, 0);
    saved.waterPressure = 100;
    stepWater(saved, 15); // one departure at tick 10, next due at tick 20
    const reloaded = parseSaveString(saveToString(saved));
    stepWater(reloaded, 5);

    expect(reloaded.tick).toBe(20);
    expect(reloaded.population).toBe(8);
    expect(saveToString(reloaded)).toBe(saveToString(straight));
  });
});

describe("crisis copy", () => {
  it("states the bill only while it is being paid", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 80;
    const billLine = getAlerts(state).find((a) => a.message.startsWith("Water pressure:"));
    expect(billLine?.message).toContain("emergency water -10/tick");

    const covered = crisisState(10, 50);
    covered.waterPressure = 80;
    const coveredLine = getAlerts(covered).find((a) => a.message.startsWith("Water pressure:"));
    expect(coveredLine?.message).not.toContain("emergency water");
  });

  it("names the departure cadence at the maximum and the floor once reached", () => {
    const state = crisisState(10, 0);
    state.waterCrisisTicks = 3; // seven critical ticks still to go
    state.waterPressure = 100;
    const line = getAlerts(state).find((a) => a.message.startsWith("Water pressure:"));
    expect(line?.message).toContain("1 colonist leaves every 10 ticks (next in 7)");

    const floored = crisisState(2, 0);
    floored.waterPressure = 100;
    const flooredLine = getAlerts(floored).find((a) => a.message.startsWith("Water pressure:"));
    expect(flooredLine?.message).toContain("population floor reached");
  });

  it("exposes the unserved count and the bill for the panel", () => {
    const state = crisisState(10, 6);
    state.waterPressure = 80;
    const stats = getColonyStats(state);
    expect(stats.waterUnserved).toBe(4);
    expect(stats.waterEmergencyCostPerTick).toBe(4);
    expect(stats.waterCoveragePercent).toBe(60);
    // housing is untouched by this rule: the anchor-only colony has none
    expect(housingCapacity(state)).toBe(0);
  });
});

describe("consecutive critical ticks (Step081 counting)", () => {
  it("counts the tick that reaches 100 as the first critical tick", () => {
    const state = crisisState(10, 0);
    stepWater(state, 24); // 4 points per tick: 96 after twenty-four
    expect(state.waterPressure).toBe(96);
    expect(state.waterCrisisTicks).toBe(0);
    stepWater(state, 1);
    expect(state.waterPressure).toBe(100);
    expect(state.waterCrisisTicks).toBe(1);
    expect(state.population).toBe(10);
  });

  it("departs on the tenth consecutive critical tick, never on the ninth", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 100;
    stepWater(state, 9);
    expect(state.waterCrisisTicks).toBe(9);
    expect(state.population).toBe(10);
    stepWater(state, 1);
    expect(state.population).toBe(9);
    expect(state.waterCrisisTicks).toBe(0); // the departure resets the count
  });

  it("restarts a full count after an interruption, with no premature departure", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 100;
    stepWater(state, 7);
    expect(state.waterCrisisTicks).toBe(7);

    // one tick of full coverage: the seven ticks are lost, not paused.
    state.resources.water = 40;
    stepWater(state, 1);
    expect(state.waterCrisisTicks).toBe(0);
    expect(state.waterPressure).toBe(99);
    expect(state.population).toBe(10);

    // new crisis: back to 100 on the very next tick, count starts again at 1.
    state.resources.water = 0;
    stepWater(state, 1);
    expect(state.waterPressure).toBe(100);
    expect(state.waterCrisisTicks).toBe(1);
    stepWater(state, 8);
    expect(state.waterCrisisTicks).toBe(9);
    expect(state.population).toBe(10); // nine ticks, nobody leaves
    stepWater(state, 1);
    expect(state.population).toBe(9); // the tenth
  });

  it("freezes the counter at the floor instead of banking departures", () => {
    const state = crisisState(2, 0);
    state.waterPressure = 100;
    stepWater(state, 30);
    expect(state.population).toBe(WATER_DEPARTURE_POPULATION_FLOOR);
    expect(state.waterCrisisTicks).toBe(WATER_DEPARTURE_INTERVAL_TICKS);
    expect(ticksUntilWaterDeparture(state)).toBeNull();
  });
});

describe("save v21 (Step081 counter)", () => {
  it("migrates a v20 save to a zero counter and departs nobody on load", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 80;
    state.waterReserveLatched = true; // a pre-latch colony at 80 reserved
    const legacy = { ...serialize(state), formatVersion: 20 } as Record<string, unknown>;
    delete legacy.waterCrisisTicks;
    const migrated = parseSave(legacy);
    expect(migrated.waterCrisisTicks).toBe(0);
    expect(migrated).toEqual({ ...state, waterCrisisTicks: 0 });
    expect(migrated.population).toBe(10);
  });

  it("round-trips the counter exactly", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 100;
    state.waterCrisisTicks = 7;
    expect(parseSaveString(saveToString(state))).toEqual(state);
  });

  it("rejects an impossible counter", () => {
    const state = crisisState(10, 0);
    const doc = serialize(state) as unknown as Record<string, unknown>;
    expect(() => parseSave({ ...doc, waterCrisisTicks: -1 })).toThrow(/waterCrisisTicks/);
    expect(() => parseSave({ ...doc, waterCrisisTicks: 3.5 })).toThrow(/waterCrisisTicks/);
    expect(() =>
      parseSave({ ...doc, waterCrisisTicks: WATER_DEPARTURE_INTERVAL_TICKS + 1 }),
    ).toThrow(/waterCrisisTicks/);
  });

  it("resumes exactly three critical ticks after a save taken at seven", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 100;
    state.waterCrisisTicks = 7;
    const resumed = parseSaveString(saveToString(state));
    stepWater(resumed, 2);
    expect(resumed.population).toBe(10);
    expect(resumed.waterCrisisTicks).toBe(9);
    stepWater(resumed, 1);
    expect(resumed.population).toBe(9);
    expect(resumed.waterCrisisTicks).toBe(0);
  });

  it("applies a loaded mature counter on the next critical tick", () => {
    const state = crisisState(10, 0);
    state.waterPressure = 100;
    state.waterCrisisTicks = WATER_DEPARTURE_INTERVAL_TICKS;
    stepWater(state, 1);
    expect(state.population).toBe(9);
  });
});

describe("hydric worker reserve (Step081 rule C)", () => {
  /** Colony of `farms` farms and `wells` wells, each on its own road. */
  function workplace(
    population: number,
    farms: number,
    wells: number,
    pressure: number,
    wellsWithRoad = true,
  ): GameState {
    const state = stockedState(CONFIG);
    stripToAnchor(state);
    state.resources.money = 10000;
    state.resources.food = 1000;
    const add = (type: "farm" | "well", withRoad: boolean) => {
      const spot = freeCell(state);
      if (withRoad) {
        const road = adjacentFree(state, spot.x, spot.y);
        mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
      }
      mustOk(applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }));
    };
    for (let i = 0; i < farms; i++) add("farm", true);
    for (let i = 0; i < wells; i++) add("well", wellsWithRoad);
    stepTicks(state, 2); // operational
    state.population = population;
    state.waterPressure = pressure;
    // Step082b: the grave band arms the reserve; the latch only decides how
    // long it holds below it.
    state.waterReserveLatched = pressure >= WATER_PRESSURE_GRAVE_THRESHOLD;
    return state;
  }

  function staffed(state: GameState): { farms: number; wells: number; posts: number } {
    let farms = 0;
    let wells = 0;
    let posts = 0;
    for (const building of Object.values(state.buildings)) {
      if (!building.staffed) continue;
      posts += 1;
      if (building.type === "farm") farms += 1;
      if (building.type === "well") wells += 1;
    }
    return { farms, wells, posts };
  }

  it("staffs both at population 10 with five of each", () => {
    const state = workplace(10, 5, 5, 75);
    expect(waterWorkerReserve(state)).toBe(5);
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 5, wells: 5, posts: 10 });
    expect(waterProductionPerTick(state)).toBe(10);
    expect(foodProductionPerTick(state)).toBe(11); // 5 farms + the Center trickle
  });

  it("gives the three available wells to a colony of 8 with seven farms", () => {
    const state = workplace(8, 7, 3, 75);
    expect(waterWorkerReserve(state)).toBe(4); // the need, capped by the wells
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 5, wells: 3, posts: 8 });
    expect(waterProductionPerTick(state)).toBe(6);
    expect(foodProductionPerTick(state)).toBe(11);
  });

  it("serves everybody at population 6 with three wells", () => {
    const state = workplace(6, 5, 3, 80);
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 3, wells: 3, posts: 6 });
    expect(waterProductionPerTick(state)).toBe(6);
    expect(foodProductionPerTick(state)).toBe(7);
  });

  it("never reserves for a disabled well", () => {
    const state = workplace(8, 7, 3, 75);
    const well = Object.values(state.buildings).find((b) => b.type === "well");
    if (!well) throw new Error("expected a well");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: well.id, active: false }));
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 6, wells: 2, posts: 8 });
    expect(waterProductionPerTick(state)).toBe(4);
  });

  it("never reserves for a well without road access", () => {
    const state = workplace(8, 7, 0, 75);
    // Wells placed away from every road: ineligible, so the reserve has no post
    // to claim even though the need would ask for four.
    const roads = allRoadCells(state.roads);
    let placed = 0;
    for (let y = 0; y < state.world.height && placed < 2; y++) {
      for (let x = 0; x < state.world.width && placed < 2; x++) {
        const key = cellKey(x, y);
        if (state.world.blockedCells[key] || roads.has(key)) continue;
        if (Object.values(state.buildings).some((b) => b.x === x && b.y === y)) continue;
        const neighbours: Array<[number, number]> = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        const nextToRoad = neighbours.some(([dx, dy]) => roads.has(cellKey(x + dx, y + dy)));
        if (nextToRoad) continue;
        mustOk(applyCommand(state, { kind: "placeBuilding", type: "well", x, y }));
        placed += 1;
      }
    }
    stepTicks(state, 2); // operational, still roadless
    state.waterPressure = 75; // the two ticks drank the opening stock
    updateWaterReserveLatch(state); // grave band: the reserve is armed
    expect(waterWorkerReserve(state)).toBe(4);
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 7, wells: 0, posts: 7 });
    expect(waterProductionPerTick(state)).toBe(0);
  });

  it("bounds the reserve by the workers available", () => {
    const state = workplace(2, 2, 3, 75);
    expect(waterWorkerReserve(state)).toBe(1);
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 1, wells: 1, posts: 2 });
    expect(waterProductionPerTick(state)).toBe(2);
  });

  it("leaves the farm-first order untouched below 75", () => {
    const state = workplace(8, 7, 3, 74);
    expect(waterWorkerReserve(state)).toBe(0);
    assignJobs(state);
    // exactly Step079's behaviour: all seven farms first, the eighth worker
    // reaches the first well — 2 water for 8 colonists.
    expect(staffed(state)).toEqual({ farms: 7, wells: 1, posts: 8 });
    expect(waterProductionPerTick(state)).toBe(2);
    expect(foodProductionPerTick(state)).toBe(15);
  });

  it("never lets the reserve starve the colony it is serving", () => {
    // the identity Step080 relies on: ceil(pop/2) wells + ceil((pop-1)/2) farms
    for (const population of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16]) {
      const state = workplace(population, population, population, 75);
      assignJobs(state);
      expect(waterProductionPerTick(state)).toBeGreaterThanOrEqual(population);
      expect(foodProductionPerTick(state)).toBeGreaterThanOrEqual(population);
    }
  });

  it("staffs wells beyond the reserve when nothing else needs the workers", () => {
    const state = workplace(4, 0, 6, 75);
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 0, wells: 4, posts: 4 });
    expect(waterProductionPerTick(state)).toBe(8);
  });

  it("puts a reactivated well back into the reserve on the next assignment", () => {
    const state = workplace(8, 7, 3, 75);
    const well = Object.values(state.buildings).find((b) => b.type === "well");
    if (!well) throw new Error("expected a well");
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: well.id, active: false }));
    assignJobs(state);
    expect(staffed(state).wells).toBe(2);

    mustOk(applyCommand(state, { kind: "setBuildingActive", id: well.id, active: true }));
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 5, wells: 3, posts: 8 });
    expect(waterProductionPerTick(state)).toBe(6);
  });

  // --- Step082b: the latch that makes the release monotone ----------------

  /** Which buildings are staffed, as a stable signature. */
  function assignment(state: GameState): string {
    return Object.values(state.buildings)
      .filter((b) => b.staffed)
      .map((b) => `${b.type}@${b.x},${b.y}`)
      .sort()
      .join(" ");
  }

  it("arms in the grave band and holds while the ordinary order stays severe", () => {
    // pop 8, 7 farms, 3 wells: the farms take everything and one well is left
    const state = workplace(8, 7, 3, 75);
    state.resources.water = 12; // a full cistern is a buffer, not a capability
    updateWaterReserveLatch(state);
    expect(state.waterReserveLatched).toBe(true);
    expect(ordinaryWaterCapacity(state)).toBe(2);
    state.waterPressure = 40; // the gauge has fallen, the capacity has not moved
    updateWaterReserveLatch(state);
    expect(state.waterReserveLatched).toBe(true);
    expect(waterWorkerReserve(state)).toBe(4);
  });

  it("releases only once the ordinary order serves at least 75 %", () => {
    const state = workplace(10, 5, 5, 75); // the ordinary order serves everybody
    updateWaterReserveLatch(state);
    expect(state.waterReserveLatched).toBe(true); // the grave band arms first
    state.waterPressure = 74; // the fall below the band is what releases
    updateWaterReserveLatch(state);
    expect(state.waterReserveLatched).toBe(false);
    expect(waterWorkerReserve(state)).toBe(0);
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 5, wells: 5, posts: 10 });
  });

  it("never arms below the grave band", () => {
    const state = workplace(10, 7, 5, 74);
    updateWaterReserveLatch(state);
    expect(state.waterReserveLatched).toBe(false);
    expect(waterWorkerReserve(state)).toBe(0);
    assignJobs(state);
    expect(staffed(state)).toEqual({ farms: 7, wells: 3, posts: 10 });
  });

  it("removes the 74/75 oscillation: one assignment, then a monotone recovery", () => {
    // pop 10, 7 farms, 5 wells: the ordinary order leaves 3 wells (6 water for
    // 10 mouths). The gauge climbs to 75, the reserve arms, coverage is full —
    // and Step081 then released it, re-renting the cycle. The latch keeps it.
    const state = workplace(10, 7, 5, 74);
    state.resources.water = 0;
    let changes = 0;
    let previous = assignment(state);
    let peak = state.waterPressure;
    for (let i = 0; i < 200; i++) {
      stepTicks(state, 1);
      peak = Math.max(peak, state.waterPressure);
      const now = assignment(state);
      if (now !== previous) {
        changes += 1;
        previous = now;
      }
    }
    expect(peak).toBeGreaterThanOrEqual(WATER_PRESSURE_GRAVE_THRESHOLD);
    expect(changes).toBe(1);
    expect(state.waterPressure).toBe(0);
    expect(state.population).toBe(10);
    expect(staffed(state)).toEqual({ farms: 5, wells: 5, posts: 10 });
    expect(waterProductionPerTick(state)).toBe(10);
    expect(foodProductionPerTick(state)).toBe(11);
  });

});

describe("save v22 (Step082b latch)", () => {
  it("round-trips the latch exactly", () => {
    const state = stockedState(CONFIG);
    state.waterReserveLatched = true;
    expect(parseSaveString(saveToString(state)).waterReserveLatched).toBe(true);
    state.waterReserveLatched = false;
    expect(parseSaveString(saveToString(state)).waterReserveLatched).toBe(false);
  });

  it("migrates a v21 save: armed in the grave band, unarmed below it", () => {
    const state = stockedState(CONFIG);
    const legacy: Record<string, unknown> = { ...serialize(state), formatVersion: 21 };
    delete legacy.waterReserveLatched;
    expect(parseSave({ ...legacy, waterPressure: 75 }).waterReserveLatched).toBe(true);
    expect(parseSave({ ...legacy, waterPressure: 74 }).waterReserveLatched).toBe(false);
  });

  it("rejects a latch that is not a boolean", () => {
    const doc: Record<string, unknown> = {
      ...serialize(stockedState(CONFIG)),
      waterReserveLatched: 1,
    };
    expect(() => parseSave(doc)).toThrow();
  });
});
