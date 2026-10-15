import { createInitialResourceStock, type ResourceStock } from "@/domain/resource/resource.js";
import { createWorld, isBlocked, type World, type WorldConfig } from "@/domain/world/world.js";
import { normalizeDeposits, type Deposits } from "@/domain/world/deposits.js";
import { cellKey } from "@/domain/shared/cells.js";
import { STARTING_AGE } from "@/content/progression.js";
import { createBuilding, type Building } from "@/domain/building/building.js";
import { createRoad, type Road } from "@/domain/road/road.js";

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
  composeD2Colony(state);
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

/**
 * D2 day-0 colony (Step021, docs/game/02-MVP.md): a small FUNCTIONING
 * colony of 10 inhabitants, granted free - placement costs are not
 * charged. Counts follow the rate math: 10 mouths need 10 food + 10
 * water per tick, producers yield 2. Residences need no roads; every
 * workplace gets an adjacent road cell. All buildings start operational;
 * staffing assigns on the first tick per the normal timing contract.
 * Treasury stays INITIAL_TREASURY (100): the opening pressure is
 * preserved, but the colony is viable (Step020 evidence).
 */
const D2_POPULATION = 10;
const D2_RESIDENCES = 10;
const D2_FARMS = 5;
const D2_WELLS = 5;
const D2_WORKSHOPS = 2;
const D2_FOOD = 60;
const D2_WATER = 40;

function composeD2Colony(state: GameState): void {
  const taken = new Set<string>();
  for (const building of Object.values(state.buildings)) {
    taken.add(cellKey(building.x, building.y));
  }
  const freeSpot = (): { x: number; y: number } => {
    for (let y = 0; y < state.world.height; y++) {
      for (let x = 0; x < state.world.width; x++) {
        const key = cellKey(x, y);
        if (taken.has(key)) continue;
        if (isBlocked(state.world, x, y)) continue;
        if (state.woodDeposits[key] || state.stoneDeposits[key]) continue;
        taken.add(key);
        return { x, y };
      }
    }
    throw new Error("world has no room for the D2 colony");
  };
  const neighbors = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const place = (type: "residence" | "farm" | "well" | "workshop", withRoad: boolean): void => {
    const spot = freeSpot();
    if (withRoad) {
      const road = neighbors
        .map((d) => ({ x: spot.x + d.x, y: spot.y + d.y }))
        .find((c) => {
          if (c.x < 0 || c.y < 0 || c.x >= state.world.width || c.y >= state.world.height) return false;
          const key = cellKey(c.x, c.y);
          if (taken.has(key) || isBlocked(state.world, c.x, c.y)) return false;
          if (state.woodDeposits[key] || state.stoneDeposits[key]) return false;
          return true;
        });
      if (!road) throw new Error("world has no room for D2 roads");
      taken.add(cellKey(road.x, road.y));
      const roadId = "road-" + String(state.roadCounter);
      state.roadCounter += 1;
      state.roads[roadId] = createRoad(roadId, [cellKey(road.x, road.y)]);
    }
    const id = "building-" + String(state.buildingCounter);
    state.buildingCounter += 1;
    const building = createBuilding(id, type, spot.x, spot.y);
    building.status = "operational";
    building.constructionTicksLeft = 0;
    state.buildings[id] = building;
  };
  for (let i = 0; i < D2_RESIDENCES; i++) place("residence", false);
  for (let i = 0; i < D2_FARMS; i++) place("farm", true);
  for (let i = 0; i < D2_WELLS; i++) place("well", true);
  for (let i = 0; i < D2_WORKSHOPS; i++) place("workshop", true);
  state.population = D2_POPULATION;
  state.resources.food = D2_FOOD;
  state.resources.water = D2_WATER;
}
