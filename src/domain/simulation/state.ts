import { createInitialResourceStock, type ResourceStock } from "@/domain/resource/resource.js";
import { createWorld, isBlocked, type World, type WorldConfig } from "@/domain/world/world.js";
import { normalizeDeposits, type Deposits } from "@/domain/world/deposits.js";
import { cellKey } from "@/domain/shared/cells.js";
import { STARTING_AGE } from "@/content/progression.js";
import { createBuilding, type Building } from "@/domain/building/building.js";
import { createRoad, type Road } from "@/domain/road/road.js";
import type { ActiveEvent, EventFrequency } from "@/domain/events/events.js";

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
  /**
   * Fractional remainder of the last food conservation loss, in [0, 1)
   * (Step067). Persisted: the granary stock is an integer, so without this
   * carry the 3%/tick law would silently round to nothing below 34 units
   * and a save/load would change the trajectory.
   */
  foodSpoilCarry: number;
  /** Aggregate population (ADR-004): one number, no individual entities. */
  population: number;
  buildings: Record<string, Building>;
  roads: Record<string, Road>;
  /** Finite cell-keyed deposits; exhausted entries remain at 0. */
  woodDeposits: Deposits;
  stoneDeposits: Deposits;
  /** Global pollution stock, 0–100 (environment system, Step014). */
  pollution: number;
  /**
   * Hydric pressure gauge, integer 0–100 (Step078). Rises while the water
   * shortage is severe, holds during a light deficit, and falls only once
   * coverage is back to 100 % — persisted so a reload cannot launder a crisis.
   */
  waterPressure: number;
  /**
   * Consecutive ticks the gauge has spent at its maximum (Step081, Step080
   * model B), 0–10. One colonist leaves when it reaches 10; it drops to 0 the
   * moment coverage returns, so an interrupted crisis restarts its count
   * instead of resuming on the global clock. Persisted: a reload must not
   * postpone (or advance) a departure.
   */
  waterCrisisTicks: number;
  /**
   * Whether the hydric worker reserve is engaged (Step082b, Step082a model B1).
   * Armed by the grave band (pressure 75); released only once the ordinary
   * order can serve at least 75 % of the colony — the band where the gauge
   * holds instead of rising, so a release can never be followed by a re-arm.
   * Persisted: a reload must not re-run the release.
   */
  waterReserveLatched: boolean;
  /** Current civilization age (progression, Step016). */
  age: number;
  /** Researched technology ids (progression, Step016). */
  researchedTechs: string[];
  /** Next deterministic entity id counters ("building-N" / "road-N"). */
  buildingCounter: number;
  roadCounter: number;
  /** Active controlled events (Step047): rate modifiers, bounded duration. */
  events: ActiveEvent[];
  /** Events master switch — sandbox default is OFF (design rule §24). */
  eventsEnabled: boolean;
  /** Recurrence cursor of the seeded draws (D4). */
  eventFrequency: EventFrequency;
  /** Seeded draw sequence index (ADR-007): f(seed, occurrence) is pure. */
  eventsDrawn: number;
  /** Tick at which the next draw fires; 0 = fires on the next resolution. */
  nextEventTick: number;
}

export function createInitialState(config: WorldConfig): GameState {
  const world = createWorld(config);
  const canonicalConfig = canonicalWorldConfig(config);
  const state: GameState = {
    world,
    worldConfig: canonicalConfig,
    tick: 0,
    resources: createInitialResourceStock(),
    foodSpoilCarry: 0,
    population: 0,
    buildings: {},
    roads: {},
    woodDeposits: normalizeDeposits(config.woodDeposits ?? []),
    stoneDeposits: normalizeDeposits(config.stoneDeposits ?? []),
    pollution: 0,
    waterPressure: 0,
    waterCrisisTicks: 0,
    waterReserveLatched: false,
    age: STARTING_AGE,
    researchedTechs: [],
    buildingCounter: 1,
    roadCounter: 1,
    events: [],
    eventsEnabled: false,
    eventFrequency: "normal",
    eventsDrawn: 0,
    nextEventTick: 0,
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
 * D2 day-0 colony (Step021, docs/game/02-MVP.md; park added by Step083): a
 * small FUNCTIONING colony of 10 inhabitants, granted free - placement costs
 * are not charged. Counts follow the rate math: 10 mouths need 10 food + 10
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
const D2_PARKS = 1;
// Tier1: exported as the single source of truth — storage derives its
// base capacities from these (storage.ts), so the two can no longer drift.
export const D2_FOOD = 60;
export const D2_WATER = 40;

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
  const place = (type: "residence" | "farm" | "well" | "workshop" | "park", withRoad: boolean): void => {
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
  // Step083: one park, the price of the two shops. Emission is not gated on
  // staffing, so the unstaffed shops emit their 2/tick and the park absorbs
  // exactly that. A park needs no road: absorption and regrowth are pure
  // adjacency, so no road cell is spent on it.
  for (let i = 0; i < D2_PARKS; i++) place("park", false);
  state.population = D2_POPULATION;
  state.resources.food = D2_FOOD;
  state.resources.water = D2_WATER;
}
