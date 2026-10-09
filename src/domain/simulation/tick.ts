import type { GameState } from "./state.js";
import { produceFood, produceWater, consumeFood, consumeWater } from "../production/production.js";
import { updatePopulation } from "../population/population.js";
import { assignJobs } from "../jobs/jobs.js";
import { collectRevenue, payMaintenance } from "../economy/economy.js";
import { produceStone, produceWood } from "../production/extraction.js";

/**
 * Fixed deterministic simulation tick (ADR-002).
 * Phase order is part of the determinism contract; extend the list as
 * systems land. Rendering never calls into this module (ADR-001).
 *
 * Current pipeline (mirrors the validated phase order):
 *   1. advanceConstruction
 *   3. produceFood / 4. produceWater   (previous tick's staffing)
 *   4c. produceWood / 4d. produceStone (extraction from finite deposits)
 *   5. consumeFood (all-or-nothing) / consumeWater
 *   6. updatePopulation (starvation + admission)
 *   7. assignJobs (next tick's staffing)
 *   8. collectRevenue → 9. payMaintenance (money model, same-tick inflow)
 */
export function stepSimulation(state: GameState): GameState {
  state.tick += 1;

  advanceConstruction(state);

  produceFood(state);
  produceWater(state);
  produceWood(state);
  produceStone(state);

  const fed = consumeFood(state);
  consumeWater(state);

  updatePopulation(state, fed);

  assignJobs(state);

  collectRevenue(state);
  payMaintenance(state);

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

export function stepTicks(state: GameState, count: number): GameState {
  for (let i = 0; i < count; i++) {
    stepSimulation(state);
  }
  return state;
}
