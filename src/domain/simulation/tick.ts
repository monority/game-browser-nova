import type { GameState } from "./state.js";

/**
 * Fixed deterministic simulation tick (ADR-002).
 * Phase order is part of the determinism contract; extend the list as
 * systems land. Rendering never calls into this module (ADR-001).
 */
export function stepSimulation(state: GameState): GameState {
  state.tick += 1;

  // Phase list (docs/game/05-SIMULATION.md §3) — populated by later slices:
  // production, consumption, needs, population, economy, milestones.
  // P1 advances time only.

  return state;
}

export function stepTicks(state: GameState, count: number): GameState {
  for (let i = 0; i < count; i++) {
    stepSimulation(state);
  }
  return state;
}
