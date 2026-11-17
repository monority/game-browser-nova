import type { GameState } from "@/domain/simulation/state.js";
import { isActive } from "@/domain/building/building.js";
import {
  environmentalQuality,
  MIN_QUALITY_FOR_ADMISSION,
} from "@/domain/environment/environment.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";
import {
  WATER_DEPARTURE_INTERVAL_TICKS,
  WATER_DEPARTURE_POPULATION_FLOOR,
  WATER_PRESSURE_MAX,
} from "@/domain/water/water.js";

/** Housing capacity = active operational residences × capacity (1 each). */
export function housingCapacity(state: GameState): number {
  let capacity = 0;
  for (const building of Object.values(state.buildings)) {
    if (!isActive(building)) continue;
    capacity += BUILDING_DEFINITIONS[building.type].housingCapacity;
  }
  return capacity;
}

/** Colonists lost per unfed tick (Step055 option B: gradual, never a wipe). */
export const STARVATION_LOSS_PER_TICK = 1;

/**
 * Population phase: gradual starvation + admission (Step055 option B).
 *
 * An unfed tick removes ONE colonist, never the whole population: the
 * loss stays readable and leaves the player the ticks needed to correct
 * the deficit. Admission is the deterministic growth mechanism: one
 * colonist per tick while housing is vacant and food is available.
 * Water gate (Step077): admission requires the water actually SERVED this
 * tick, not the residual stock. Wells produce before the colonists drink, so
 * an exactly balanced colony ends every tick at 0 water while serving every
 * colonist; testing that stock froze growth for good, silently. The served
 * count is the law the shortage alert already uses — min(stock + production,
 * need). At population 0 it holds trivially (0 >= 0), which subsumes the old
 * bootstrap exemption.
 */
export function updatePopulation(
  state: GameState,
  fedColonists: number,
  servedWater: number,
): void {
  if (fedColonists < state.population) {
    state.population = Math.max(0, state.population - STARVATION_LOSS_PER_TICK);
  }

  if (
    state.population < housingCapacity(state) &&
    state.resources.food > 0 &&
    servedWater >= state.population &&
    // environmental gate (Step014): growth stops in degraded air; the
    // bootstrap exemption mirrors the water rule
    (state.population === 0 || environmentalQuality(state) >= MIN_QUALITY_FOR_ADMISSION)
  ) {
    state.population += 1;
  }
}

/**
 * Hydric departures (Step081, Step080 model B): ten CONSECUTIVE ticks at
 * maximum pressure — not every tenth tick of the global clock.
 *
 * Step079 measured why the clock failed: a crisis that started at t48 produced
 * a departure at t50, two ticks of real crisis, because 50 happened to be a
 * multiple of ten. The counter makes the rule true: it advances only while the
 * gauge is at its maximum, and any tick of coverage resets it, so an
 * interrupted crisis restarts a full ten.
 *
 * It is persisted `waterCrisisTicks` (save v21), never encoded in the gauge:
 * the gauge keeps its own law and the counter only observes it.
 *
 * The floor of 2 is the smallest colony that can still staff a farm and a well,
 * so thirst never wipes the settlement: it can drain it to a stall the player
 * must break, never to a defeat the player never chose.
 */
export function waterDepartureDue(state: GameState): boolean {
  return (
    state.waterPressure >= WATER_PRESSURE_MAX &&
    state.waterCrisisTicks >= WATER_DEPARTURE_INTERVAL_TICKS &&
    state.population > WATER_DEPARTURE_POPULATION_FLOOR
  );
}

/**
 * Ticks until the next departure, or null when none can occur (gauge below its
 * maximum, or the population floor reached). Read straight off the counter, so
 * the panel's countdown is the simulation's own number.
 */
export function ticksUntilWaterDeparture(state: GameState): number | null {
  if (state.waterPressure < WATER_PRESSURE_MAX) return null;
  if (state.population <= WATER_DEPARTURE_POPULATION_FLOOR) return null;
  return Math.max(0, WATER_DEPARTURE_INTERVAL_TICKS - state.waterCrisisTicks);
}

/**
 * The single crisis step of a tick (rule D: one call site, one execution).
 * Advances the counter, then applies at most ONE departure. Returns how many
 * colonists left (0 or 1).
 *
 * Convention, applied everywhere: the tick that REACHES the maximum is the
 * first critical tick — the gauge is read after its own update, so the tenth
 * such tick is the departure, exactly nine ticks later.
 *
 * At the floor the counter freezes at the maximum instead of resetting: the
 * crisis is not forgiven, the colony simply has nobody left to lose, and no
 * departure is queued for later.
 */
export function updateWaterCrisis(state: GameState): number {
  if (state.waterPressure < WATER_PRESSURE_MAX) {
    state.waterCrisisTicks = 0;
    return 0;
  }
  state.waterCrisisTicks = Math.min(
    WATER_DEPARTURE_INTERVAL_TICKS,
    state.waterCrisisTicks + 1,
  );
  if (!waterDepartureDue(state)) return 0;
  state.population -= 1;
  state.waterCrisisTicks = 0;
  return 1;
}
