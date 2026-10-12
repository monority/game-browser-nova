import { createInitialResourceStock, type ResourceStock } from "../resource/resource.js";
import { createWorld, type World, type WorldConfig } from "../world/world.js";
import { normalizeDeposits, type Deposits } from "../world/deposits.js";
import { cellKey } from "../shared/cells.js";
import { STARTING_AGE } from "../../content/progression.js";
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
  /** Aggregate population (ADR-004): one number, no individual entities. */
  population: number;
  buildings: Record<string, Building>;
  roads: Record<string, Road>;
  /** Finite cell-keyed deposits; exhausted entries remain at 0. */
  woodDeposits: Deposits;
  stoneDeposits: Deposits;
  /** Global pollution stock, 0–100 (environment system, Step014). */
  pollution: number;
  /** Current civilization age (progression, Step016). */
  age: number;
  /** Researched technology ids (progression, Step016). */
  researchedTechs: string[];
  /** Next deterministic entity id counters ("building-N" / "road-N"). */
  buildingCounter: number;
  roadCounter: number;
}

export function createInitialState(config: WorldConfig): GameState {
  const world = createWorld(config);
  const canonicalConfig = canonicalWorldConfig(config);
  const state: GameState = {
    world,
    worldConfig: canonicalConfig,
    tick: 0,
    resources: createInitialResourceStock(),
    population: 0,
    buildings: {},
    roads: {},
    woodDeposits: normalizeDeposits(config.woodDeposits ?? []),
    stoneDeposits: normalizeDeposits(config.stoneDeposits ?? []),
    pollution: 0,
    age: STARTING_AGE,
    researchedTechs: [],
    buildingCounter: 1,
    roadCounter: 1,
  };

  prePlaceColonyCenter(state);
  return state;
}

const COLONY_CENTER_ID = "colony-center";

/**
 * Canonical config shape: every key always present. Keeps persistence
 * round-trips lossless (serialize/parse build the identical shape).
 */
function canonicalWorldConfig(config: WorldConfig): WorldConfig {
  return {
    seed: config.seed,
    width: config.width,
    height: config.height,
    blockedCells: [...(config.blockedCells ?? [])],
    woodDeposits: [...(config.woodDeposits ?? [])],
    stoneDeposits: [...(config.stoneDeposits ?? [])],
  };
}

/**
 * Day-0 bootstrap (Step004 mandate): every new colony owns exactly one
 * Colony Center, operational from tick 0, placed deterministically at the
 * bottom-right-most buildable cell (y desc / x desc, skipping blocked
 * cells and deposits). The anchor is never player-placed and is the
 * anti-self-lock recovery path at any population.
 */
function prePlaceColonyCenter(state: GameState): void {
  for (let y = state.world.height - 1; y >= 0; y--) {
    for (let x = state.world.width - 1; x >= 0; x--) {
      const key = cellKey(x, y);
      if (state.world.blockedCells[key]) continue;
      if (state.woodDeposits[key] || state.stoneDeposits[key]) continue;
      const anchor: Building = {
        id: COLONY_CENTER_ID,
        type: "colonyCenter",
        x,
        y,
        status: "operational",
        constructionTicksLeft: 0,
        staffed: false,
        active: true,
      };
      state.buildings[COLONY_CENTER_ID] = anchor;
      return;
    }
  }
  throw new Error("world has no buildable cell for the Colony Center");
}
