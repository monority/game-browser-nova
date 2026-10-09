import type { GameState } from "./state.js";

/**
 * Fixed deterministic simulation tick (ADR-002).
 * Phase order is part of the determinism contract; extend the list as
 * systems land. Rendering never calls into this module (ADR-001).
 */
export function stepSimulation(state: GameState): GameState {
  state.tick += 1;

  // Phase 1 — construction progress (deterministic id order).
  advanceConstruction(state);

  // Later phases (docs/game/05-SIMULATION.md §3) land with their slices:
  // production, consumption, needs, population, economy, milestones.

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
