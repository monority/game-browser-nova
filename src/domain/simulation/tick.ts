import type { GameState } from "./state.js";
import { produceFood, produceWater, consumeFood, consumeWater } from "@/domain/production/production.js";
import { updatePopulation } from "@/domain/population/population.js";
import { assignJobs } from "@/domain/jobs/jobs.js";
import { collectRevenue, payCrowding, payMaintenance } from "@/domain/economy/economy.js";
import { updateEnvironment } from "@/domain/environment/environment.js";
import { resolveEvents } from "@/domain/events/events.js";
import { produceStone, produceWood } from "@/domain/production/extraction.js";
import { producePlanks } from "@/domain/production/transformation.js";
import { updateWaterPressure } from "@/domain/water/water.js";
import { clampStorage } from "@/domain/storage/storage.js";
import { applyFoodSpoilage } from "@/domain/storage/spoilage.js";

/**
 * What the LAST tick actually moved (Step067). A reading of the transition
 * that produced the current stocks — never persisted and never authoritative:
 * `state` stays the only source of truth (same pattern as the money
 * projections in economy.ts). Callers that need per-tick measurements (stats
 * panel, benches) pass a mutable record in; the tick overwrites it.
 */
export interface TickFlows {
  /** Food added by production this tick (harvest events excluded). */
  foodProduced: number;
  /** Food actually eaten this tick (the served amount, not the need). */
  foodConsumed: number;
  /** Food lost to conservation this tick (whole units; the fraction is carried). */
  foodSpoiled: number;
  /** Food destroyed by the storage cap at the end of the tick. */
  foodWasted: number;
  /** Water destroyed by the storage cap at the end of the tick. */
  waterWasted: number;
}

export function emptyTickFlows(): TickFlows {
  return { foodProduced: 0, foodConsumed: 0, foodSpoiled: 0, foodWasted: 0, waterWasted: 0 };
}

/**
 * Fixed deterministic simulation tick (ADR-002).
 * Phase order is part of the determinism contract; extend the list as
 * systems land. Rendering never calls into this module (ADR-001).
 *
 * Current pipeline (mirrors the validated phase order):
 *   1. advanceConstruction
 *   2. produceFood / produceWater (previous tick's staffing)
 *   3. produceWood / produceStone (extraction from finite deposits)
 *   4. producePlanks (Workshop transformation, 2 wood → 1 plank)
 *   5a. applyFoodSpoilage (Step067: proportional conservation loss, runs
 *       AFTER production and BEFORE consumption so colonists eat what
 *       survived the granary instead of what was just harvested)
 *   5b. consumeFood (partial feeding) / consumeWater
 *   6. clampStorage (Step031: food/water capped, true surplus lost —
 *       runs after consumption so the clamp never eats what colonists
 *       would have consumed this tick)
 *   7. updatePopulation (gradual starvation + admission)
 *   8. updateEnvironment (pollution flows + park wood regrowth). Runs
 *       BEFORE assignJobs so emission follows the staffing set that
 *       produced THIS tick's output (assigned at the end of the previous
 *       tick, Step064) — an idling workshop emits nothing
 *   9. assignJobs (next tick's staffing)
 *   10. collectRevenue → payMaintenance → payCrowding (money model, same-tick inflow;
 *       commerce comes only from staffed workshops, Step065)
 *   11. resolveEvents (Step047: expire + seeded draws; canonical phase 12
 *       of 05-SIMULATION §3 — active events feed the NEXT tick's
 *       production/commerce phases, same timing contract as staffing)
 */
export function stepSimulation(state: GameState, flows?: TickFlows): GameState {
  state.tick += 1;

  advanceConstruction(state);

  const foodBeforeHarvest = state.resources.food;
  produceFood(state);
  const foodProduced = state.resources.food - foodBeforeHarvest;
  produceWater(state);
  produceWood(state);
  produceStone(state);
  const planksProduced = producePlanks(state);

  const foodSpoiled = applyFoodSpoilage(state);

  const foodBeforeConsumption = state.resources.food;
  const fedColonists = consumeFood(state);
  const foodConsumed = foodBeforeConsumption - state.resources.food;
  // Step077: the served count is the coverage numerator — the growth gate
  // reads it, and so does the pressure gauge (Step078). The need is captured
  // before admission: an admitted colonist drinks from the NEXT tick.
  const waterNeed = state.population;
  const waterServed = consumeWater(state);

  const clamp = clampStorage(state);

  updatePopulation(state, fedColonists, waterServed);
  state.waterPressure = updateWaterPressure(state.waterPressure, waterServed, waterNeed);

  updateEnvironment(state);

  assignJobs(state);

  collectRevenue(state, planksProduced);
  payMaintenance(state);
  payCrowding(state); // Step072: the people cost more than the buildings
  resolveEvents(state);

  if (flows) {
    // Measured as stock deltas: the reported numbers are the quantities the
    // phases really moved, never a re-derivation that could drift from them.
    flows.foodProduced = foodProduced;
    flows.foodConsumed = foodConsumed;
    flows.foodSpoiled = foodSpoiled;
    flows.foodWasted = clamp.foodWasted;
    flows.waterWasted = clamp.waterWasted;
  }

  return state;
}

function advanceConstruction(state: GameState): void {
  const ids = Object.keys(state.buildings).sort();
  for (const id of ids) {
    const building = state.buildings[id];
    if (!building || building.status !== "underConstruction") continue;
    building.constructionTicksLeft -= 1;
    if (building.constructionTicksLeft <= 0) {
      building.status = "operational";
      building.constructionTicksLeft = 0;
    }
  }
}

export function stepTicks(state: GameState, count: number, flows?: TickFlows): GameState {
  for (let i = 0; i < count; i++) {
    stepSimulation(state, flows);
  }
  return state;
}
