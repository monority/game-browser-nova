import { createInitialResourceStock, type ResourceStock } from "../resource/resource.js";
import { createWorld, type World, type WorldConfig } from "../world/world.js";

/**
 * Canonical simulation state: facts only, no derived values, no
 * rendering/UI objects (ADR-001, docs/game/04-ARCHITECTURE.md §7).
 */
export interface GameState {
  world: World;
  worldConfig: WorldConfig;
  /** Fixed simulation tick; monotonic, starts at 0. */
  tick: number;
  resources: ResourceStock;
}

export function createInitialState(config: WorldConfig): GameState {
  const world = createWorld(config);
  return {
    world,
    worldConfig: config,
    tick: 0,
    resources: createInitialResourceStock(),
  };
}
