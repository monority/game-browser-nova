import type { GameState } from "./state.js";
import { produceFood, produceWater, consumeFood, consumeWater } from "@/domain/production/production.js";
import { updatePopulation, updateWaterCrisis } from "@/domain/population/population.js";
import {
  assignJobs,
  updateWaterReserveLatch,
  type IndustryAllocationPolicy,
} from "@/domain/jobs/jobs.js";
import {
  collectRevenue,
  payCrowding,
  payMaintenance,
  payWaterEmergency,
} from "@/domain/economy/economy.js";
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
  /** Wood really taken out of the deposits this tick (W1-C1, 2026-11-20).
   *  Read as the deposits' remaining delta across phase 3 — the flow itself,
   *  never a re-derivation from stocks. */
  woodProduced: number;
  /** Wood really consumed by the workshops this tick (phase 4 delta). */
  woodConsumed: number;
  /** Planks really produced this tick (what producePlanks returned). */
  planksProduced: number;
}

export function emptyTickFlows(): TickFlows {
  return {
    foodProduced: 0,
    foodConsumed: 0,
    foodSpoiled: 0,
    foodWasted: 0,
    waterWasted: 0,
    woodProduced: 0,
    woodConsumed: 0,
    planksProduced: 0,
  };
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
 *   7. updatePopulation (gradual starvation + admission) then the hydric gauge
 *       and applyWaterDepartures (Step079: departures read the gauge the tick
 *       just wrote, and the next phase staffs with the smaller colony)
 *   8. updateEnvironment (pollution flows + park wood regrowth). Runs
 *       BEFORE assignJobs, so the flows of a tick settle before the next
 *       staffing set is chosen. Emission is NOT gated on staffing (Step083,
 *       superseding Step064): an idle connected workshop still earns its
 *       2/tick floor, and what trades costs the air
 *   9. assignJobs (next tick's staffing)
 *   10. collectRevenue → payMaintenance → payWaterEmergency → payCrowding (money
 *       model, same-tick inflow; commerce comes only from staffed workshops,
 *       Step065; the emergency water bill is paid before the people's crowding
 *       charge — survival before comfort, Step079)
 *   11. resolveEvents (Step047: expire + seeded draws; canonical phase 12
 *       of 05-SIMULATION §3 — active events feed the NEXT tick's
 *       production/commerce phases, same timing contract as staffing)
 */
/** Bois encore dans le sol — sert uniquement à mesurer le flux de la phase 3
 *  quand l'appelant demande des flux (W1-C1). Lecture pure, aucun effet. */
function totalWoodRemaining(state: GameState): number {
  let total = 0;
  for (const deposit of Object.values(state.woodDeposits)) total += deposit.remaining;
  return total;
}

export function stepSimulation(
  state: GameState,
  flows?: TickFlows,
  policy: IndustryAllocationPolicy = "conditional-wood",
): GameState {
  state.tick += 1;

  advanceConstruction(state);

  const foodBeforeHarvest = state.resources.food;
  produceFood(state);
  const foodProduced = state.resources.food - foodBeforeHarvest;
  produceWater(state);
  const depositsBeforeExtraction = flows ? totalWoodRemaining(state) : 0;
  produceWood(state);
  produceStone(state);
  const woodProduced = flows ? depositsBeforeExtraction - totalWoodRemaining(state) : 0;
  const woodBeforeTransformation = state.resources.wood;
  const planksProduced = producePlanks(state);
  const woodConsumed = flows ? woodBeforeTransformation - state.resources.wood : 0;

  const foodSpoiled = applyFoodSpoilage(state);

  const foodBeforeConsumption = state.resources.food;
  const fedColonists = consumeFood(state);
  const foodConsumed = foodBeforeConsumption - state.resources.food;
  // Step077: the served count is the coverage numerator — the growth gate
  // reads it, and so does the pressure gauge (Step078). The need is captured
  // before admission: an admitted colonist drinks from the NEXT tick.
  const waterNeed = state.population;
  const waterServed = consumeWater(state);
  // Step079: the bill's basis is this tick's own shortfall, captured on the
  // gauge's basis (pre-admission). A colonist admitted this tick drinks next
  // tick, so charging for it here would bill a shortage nobody suffered.
  const waterUnserved = Math.max(0, waterNeed - waterServed);

  const clamp = clampStorage(state);

  updatePopulation(state, fedColonists, waterServed);
  state.waterPressure = updateWaterPressure(state.waterPressure, waterServed, waterNeed);
  // Rule C, Step081: ONE call advances the consecutive-critical counter and
  // applies at most one departure. It reads the gauge the tick just wrote — the
  // tick that reaches 100 is the first critical tick — and the staffing that
  // follows already uses the smaller colony.
  updateWaterCrisis(state);
  // Step082b: the reserve latch is decided once per tick, on the gauge this
  // tick wrote and on the colony the departures left behind — the assignment
  // below must use this tick's latch, and the order it probes is the one that
  // assignment would apply.
  updateWaterReserveLatch(state);

  updateEnvironment(state);

  assignJobs(state, policy);

  collectRevenue(state, planksProduced);
  payMaintenance(state);
  payWaterEmergency(state, waterUnserved); // Step079 rule B
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
    flows.woodProduced = woodProduced;
    flows.woodConsumed = woodConsumed;
    flows.planksProduced = planksProduced;
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

export function stepTicks(
  state: GameState,
  count: number,
  flows?: TickFlows,
  policy: IndustryAllocationPolicy = "conditional-wood",
): GameState {
  for (let i = 0; i < count; i++) {
    stepSimulation(state, flows, policy);
  }
  return state;
}
