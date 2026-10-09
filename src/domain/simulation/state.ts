import { createInitialResourceStock, type ResourceStock } from "../resource/resource.js";
import { createWorld, type World, type WorldConfig } from "../world/world.js";
import type { Building } from "../building/building.js";
import type { Road } from "../road/road.js";

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
  buildings: Record<string, Building>;
  roads: Record<string, Road>;
  /** Next deterministic entity id counters ("building-N" / "road-N"). */
  buildingCounter: number;
  roadCounter: number;
}

export function createInitialState(config: WorldConfig): GameState {
  const world = createWorld(config);
  return {
    world,
    worldConfig: config,
    tick: 0,
    resources: createInitialResourceStock(),
    buildings: {},
    roads: {},
    buildingCounter: 1,
    roadCounter: 1,
  };
}
