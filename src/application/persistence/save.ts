import { BUILDING_DEFINITIONS, type BuildingType } from "@/content/buildings.js";
import { TECH_DEFINITIONS } from "@/content/techs.js";
import { cellKey, parseCellKey } from "@/domain/shared/cells.js";
import type { Building, BuildingStatus } from "@/domain/building/building.js";
import type { Road } from "@/domain/road/road.js";
import { depositCapacities, type Deposits } from "@/domain/world/deposits.js";
import { createWorld, inBounds, isBlocked } from "@/domain/world/world.js";
import { POLLUTION_MAX } from "@/domain/environment/environment.js";
import {
  EVENT_FREQUENCIES,
  EVENT_KINDS,
  type ActiveEvent,
  type EventFrequency,
} from "@/domain/events/events.js";
import type { GameState } from "@/domain/simulation/state.js";
import type { ResourceStock } from "@/domain/resource/resource.js";
import type { WorldConfig } from "@/domain/world/world.js";

/**
 * Versioned persistence (ADR-006). This rebuild starts fresh at v13 —
 * no legacy migration chain (user decision; no legacy saves exist).
 *
 * Saves contain canonical state only: world CONFIGURATION (terrain is
 * deterministically regenerated from the seed, ADR-005), current deposit
 * amounts, resources, population, buildings, roads, counters. Never
 * renderer/UI/derived data (docs/SAVE-FORMAT.md §3).
 *
 * Invalid saves are rejected explicitly — never loaded as plausible state
 * (docs/ERROR-HANDLING.md §4).
 */

export const SAVE_VERSION = 18;
/** Oldest save version this build can migrate forward. */
export const MIGRATABLE_SAVE_VERSION = 13;
/** The single localStorage slot this game reads and writes. */
export const SAVE_STORAGE_KEY = "nova-save";

interface SaveDocument {
  formatVersion: number;
  world: {
    seed: string;
    width: number;
    height: number;
    blockedCells: string[];
    woodDeposits: Array<{ x: number; y: number; amount: number }>;
    stoneDeposits: Array<{ x: number; y: number; amount: number }>;
  };
  deposits: { wood: Deposits; stone: Deposits };
  pollution: number;
  age: number;
  researchedTechs: string[];
  tick: number;
  resources: ResourceStock;
  population: number;
  buildings: Building[];
  roads: Road[];
  buildingCounter: number;
  roadCounter: number;
  events: ActiveEvent[];
  eventsEnabled: boolean;
  eventFrequency: EventFrequency;
  eventsDrawn: number;
  nextEventTick: number;
}

export class SaveValidationError extends Error {}

export function serialize(state: GameState): SaveDocument {
  return {
    formatVersion: SAVE_VERSION,
    world: {
      seed: state.worldConfig.seed,
      width: state.worldConfig.width,
      height: state.worldConfig.height,
      blockedCells: [...(state.worldConfig.blockedCells ?? [])],
      woodDeposits: (state.worldConfig.woodDeposits ?? []).map((d) => ({ ...d })),
      stoneDeposits: (state.worldConfig.stoneDeposits ?? []).map((d) => ({ ...d })),
    },
    deposits: {
      wood: Object.fromEntries(
        Object.entries(state.woodDeposits).map(([key, cell]) => [key, { ...cell }]),
      ),
      stone: Object.fromEntries(
        Object.entries(state.stoneDeposits).map(([key, cell]) => [key, { ...cell }]),
      ),
    },
    pollution: state.pollution,
    age: state.age,
    researchedTechs: [...state.researchedTechs],
    tick: state.tick,
    resources: { ...state.resources },
    population: state.population,
    buildings: Object.values(state.buildings).map((b) => ({ ...b })),
    roads: Object.values(state.roads).map((r) => ({ id: r.id, cells: [...r.cells] })),
    buildingCounter: state.buildingCounter,
    roadCounter: state.roadCounter,
    events: state.events.map((event) => ({ ...event })),
    eventsEnabled: state.eventsEnabled,
    eventFrequency: state.eventFrequency,
    eventsDrawn: state.eventsDrawn,
    nextEventTick: state.nextEventTick,
  };
}

export function parseSave(input: unknown): GameState {
  if (!isRecord(input)) throw new SaveValidationError("save is not an object");
  const version = input.formatVersion;
  if (typeof version !== "number" || !Number.isFinite(version)) {
    throw new SaveValidationError(`unsupported save version: ${String(version)}`);
  }
  if (version < MIGRATABLE_SAVE_VERSION || version > SAVE_VERSION) {
    throw new SaveValidationError(
      `unsupported save version: ${String(version)} (expected ${SAVE_VERSION}, migratable from ${MIGRATABLE_SAVE_VERSION})`,
    );
  }
  // sequential migration chain: v13 -> v14 -> v15 -> v16 -> v17 -> v18
  let doc: Record<string, unknown> = input;
  if (Number(doc.formatVersion) === 13) doc = migrateV13ToV14(doc);
  if (Number(doc.formatVersion) === 14) doc = migrateV14ToV15(doc);
  if (Number(doc.formatVersion) === 15) doc = migrateV15ToV16(doc);
  if (Number(doc.formatVersion) === 16) doc = migrateV16ToV17(doc);
  if (Number(doc.formatVersion) === 17) doc = migrateV17ToV18(doc);

  const world = doc.world;
  if (!isRecord(world)) throw new SaveValidationError("save.world missing");
  const width = expectPositiveInt(world.width, "world.width");
  const height = expectPositiveInt(world.height, "world.height");
  const blockedCells = expectCellKeyArray(world.blockedCells, "world.blockedCells");
  const woodSeeds = expectDepositSeeds(world.woodDeposits, "world.woodDeposits");
  const stoneSeeds = expectDepositSeeds(world.stoneDeposits, "world.stoneDeposits");
  const bounds = { width, height };
  // Terrain and deposits are regenerated from the config: their cells must
  // lie inside the world the save describes.
  for (const key of blockedCells) {
    const { x, y } = parseCellKey(key);
    if (!inBounds(x, y, bounds)) {
      throw new SaveValidationError(`world.blockedCells is out of bounds: ${key}`);
    }
  }
  for (const seed of [...woodSeeds, ...stoneSeeds]) {
    if (!inBounds(seed.x, seed.y, bounds)) {
      throw new SaveValidationError(`world deposit is out of bounds: ${seed.x},${seed.y}`);
    }
  }
  const config: WorldConfig = {
    seed: expectString(world.seed, "world.seed"),
    width,
    height,
    blockedCells,
    woodDeposits: woodSeeds,
    stoneDeposits: stoneSeeds,
  };
  const generated = createWorld(config); // deterministic regeneration (ADR-005)

  const deposits = doc.deposits;
  if (!isRecord(deposits)) throw new SaveValidationError("save.deposits missing");
  const woodDeposits = expectDeposits(deposits.wood, "deposits.wood");
  const stoneDeposits = expectDeposits(deposits.stone, "deposits.stone");
  for (const [field, record] of [
    ["wood", woodDeposits],
    ["stone", stoneDeposits],
  ] as const) {
    for (const key of Object.keys(record)) {
      const { x, y } = parseCellKey(key);
      if (!inBounds(x, y, bounds)) {
        throw new SaveValidationError(`deposits.${field} has an out-of-bounds cell: ${key}`);
      }
    }
  }

  const resources = doc.resources;
  if (!isRecord(resources)) throw new SaveValidationError("save.resources missing");
  const stock: ResourceStock = {
    food: expectNonNegativeNumber(resources.food, "resources.food"),
    water: expectNonNegativeNumber(resources.water, "resources.water"),
    money: expectNonNegativeNumber(resources.money, "resources.money"),
    wood: expectNonNegativeNumber(resources.wood, "resources.wood"),
    stone: expectNonNegativeNumber(resources.stone, "resources.stone"),
    planks: expectNonNegativeNumber(resources.planks, "resources.planks"),
  };

  if (!Array.isArray(doc.buildings)) {
    throw new SaveValidationError("save.buildings must be an array");
  }
  const buildings: Record<string, Building> = {};
  for (const raw of doc.buildings) {
    if (!isRecord(raw)) throw new SaveValidationError("building must be an object");
    const id = expectString(raw.id, "building.id");
    const type = expectString(raw.type, "building.type") as BuildingType;
    if (!BUILDING_DEFINITIONS[type]) {
      throw new SaveValidationError(`unknown building type: ${type}`);
    }
    if (buildings[id]) throw new SaveValidationError(`duplicate building id: ${id}`);
    const status = expectString(raw.status, "building.status") as BuildingStatus;
    if (status !== "underConstruction" && status !== "operational") {
      throw new SaveValidationError(`invalid building status: ${status}`);
    }
    const x = expectNonNegativeInt(raw.x, "building.x");
    const y = expectNonNegativeInt(raw.y, "building.y");
    if (!inBounds(x, y, bounds)) {
      throw new SaveValidationError(`building ${id} is out of bounds: ${x},${y}`);
    }
    const constructionTicksLeft = expectNonNegativeInt(
      raw.constructionTicksLeft,
      "building.constructionTicksLeft",
    );
    if (status === "operational" && constructionTicksLeft !== 0) {
      throw new SaveValidationError(`operational building ${id} has construction time left`);
    }
    if (status === "underConstruction" && constructionTicksLeft === 0) {
      throw new SaveValidationError(`building ${id} is under construction with no time left`);
    }
    buildings[id] = {
      id,
      type,
      x,
      y,
      status,
      constructionTicksLeft,
      staffed: expectBoolean(raw.staffed, "building.staffed"),
      active: expectBoolean(raw.active, "building.active"),
    };
  }
  if (!buildings["colony-center"]) {
    throw new SaveValidationError("save is missing the Colony Center anchor");
  }
  // Cell layout must be physically consistent: no two buildings share a
  // cell, and no building overwrites terrain or a finite deposit.
  const buildingCells = new Set<string>();
  for (const building of Object.values(buildings)) {
    const key = cellKey(building.x, building.y);
    if (buildingCells.has(key)) {
      throw new SaveValidationError(`two buildings occupy the same cell: ${key}`);
    }
    buildingCells.add(key);
    if (isBlocked(generated, building.x, building.y)) {
      throw new SaveValidationError(`building ${building.id} sits on a blocked cell: ${key}`);
    }
    if (woodDeposits[key] || stoneDeposits[key]) {
      throw new SaveValidationError(`building ${building.id} sits on a deposit: ${key}`);
    }
  }

  if (!Array.isArray(doc.roads)) throw new SaveValidationError("save.roads must be an array");
  const roads: Record<string, Road> = {};
  const roadCells = new Set<string>();
  for (const raw of doc.roads) {
    if (!isRecord(raw)) throw new SaveValidationError("road must be an object");
    const id = expectString(raw.id, "road.id");
    if (roads[id]) throw new SaveValidationError(`duplicate road id: ${id}`);
    const cells = expectCellKeyArray(raw.cells, "road.cells");
    if (cells.length === 0) throw new SaveValidationError(`road ${id} has no cells`);
    for (const key of cells) {
      const { x, y } = parseCellKey(key);
      if (!inBounds(x, y, bounds)) {
        throw new SaveValidationError(`road ${id} cell is out of bounds: ${key}`);
      }
      if (isBlocked(generated, x, y)) {
        throw new SaveValidationError(`road ${id} crosses a blocked cell: ${key}`);
      }
      if (buildingCells.has(key)) {
        throw new SaveValidationError(`road ${id} overlaps a building at ${key}`);
      }
      if (roadCells.has(key)) throw new SaveValidationError(`duplicate road cell: ${key}`);
      roadCells.add(key);
    }
    roads[id] = { id, cells };
  }

  const population = expectNonNegativeInt(doc.population, "population");
  const tick = expectNonNegativeInt(doc.tick, "tick");
  const buildingCounter = expectPositiveInt(doc.buildingCounter, "buildingCounter");
  const roadCounter = expectPositiveInt(doc.roadCounter, "roadCounter");

  const pollution = expectNonNegativeNumber(doc.pollution, "pollution");
  // Tier1: the domain documents pollution as a 0–100 stock
  // (domain/environment/environment.ts); reject out-of-range saves.
  if (pollution > POLLUTION_MAX) {
    throw new SaveValidationError(`pollution must be <= ${POLLUTION_MAX}`);
  }
  const age = expectPositiveInt(doc.age, "age");
  if (!Array.isArray(doc.researchedTechs)) {
    throw new SaveValidationError("save.researchedTechs must be an array");
  }
  const researchedTechs: string[] = [];
  for (const techId of doc.researchedTechs) {
    if (typeof techId !== "string") {
      throw new SaveValidationError("researchedTechs entries must be strings");
    }
    if (!TECH_DEFINITIONS[techId]) {
      throw new SaveValidationError(`unknown tech: ${techId}`);
    }
    if (researchedTechs.includes(techId)) {
      throw new SaveValidationError(`duplicate tech: ${techId}`);
    }
    researchedTechs.push(techId);
  }

  // Controlled events (Step047): strict shape — unknown kinds/frequencies
  // are corrupt data, never plausible state.
  if (!Array.isArray(doc.events)) throw new SaveValidationError("save.events must be an array");
  const events: ActiveEvent[] = [];
  for (const raw of doc.events) {
    if (!isRecord(raw)) throw new SaveValidationError("event must be an object");
    const kind = expectString(raw.kind, "event.kind");
    if (!EVENT_KINDS.includes(kind as never)) {
      throw new SaveValidationError(`unknown event kind: ${kind}`);
    }
    const ticksLeft = expectNonNegativeInt(raw.ticksLeft, "event.ticksLeft");
    if (ticksLeft < 1) throw new SaveValidationError("event.ticksLeft must be >= 1");
    events.push({ kind: kind as ActiveEvent["kind"], ticksLeft });
  }
  const eventsEnabled = expectBoolean(doc.eventsEnabled, "save.eventsEnabled");
  const eventFrequency = expectString(doc.eventFrequency, "save.eventFrequency");
  if (!EVENT_FREQUENCIES.includes(eventFrequency as never)) {
    throw new SaveValidationError(`unknown event frequency: ${eventFrequency}`);
  }
  const eventsDrawn = expectNonNegativeInt(doc.eventsDrawn, "save.eventsDrawn");
  const nextEventTick = expectNonNegativeInt(doc.nextEventTick, "save.nextEventTick");

  return {
    world: generated,
    worldConfig: config,
    tick,
    resources: stock,
    population,
    buildings,
    roads,
    woodDeposits,
    stoneDeposits,
    pollution,
    age,
    researchedTechs,
    buildingCounter,
    roadCounter,
    events,
    eventsEnabled,
    eventFrequency: eventFrequency as EventFrequency,
    eventsDrawn,
    nextEventTick,
  };
}

export function saveToString(state: GameState): string {
  return JSON.stringify(serialize(state));
}

/**
 * v17 -> v18 (Step047): add controlled events, defaulting to off/none.
 * No active event can exist in a v17 save (the system did not exist) —
 * value-preserving defaults only.
 */
function migrateV17ToV18(document: Record<string, unknown>): Record<string, unknown> {
  return {
    ...document,
    formatVersion: 18,
    events: [],
    eventsEnabled: false,
    eventFrequency: "normal",
    eventsDrawn: 0,
    nextEventTick: 0,
  };
}

/**
 * v13 → v14 (Step009): add the mothball flag, defaulting every existing
 * building to active — value-preserving, no existing field renamed.
 */
function migrateV13ToV14(document: Record<string, unknown>): Record<string, unknown> {
  const buildings = document.buildings;
  if (!Array.isArray(buildings)) {
    throw new SaveValidationError("save.buildings must be an array");
  }
  return {
    ...document,
    formatVersion: 14,
    buildings: buildings.map((raw) =>
      isRecord(raw) ? { active: true, ...raw } : raw,
    ),
  };
}

/** v14 → v15 (Step014): add the pollution stock, defaulting to 0. */
function migrateV14ToV15(document: Record<string, unknown>): Record<string, unknown> {
  return {
    ...document,
    formatVersion: 15,
    pollution: 0,
  };
}

/** v15 -> v16 (Step016): add age + researched techs, defaulting to Age 1 / none. */
function migrateV15ToV16(document: Record<string, unknown>): Record<string, unknown> {
  return {
    ...document,
    formatVersion: 16,
    age: 1,
    researchedTechs: [],
  };
}

/** v16 -> v17 (Step018): deposit cells gain a regrowth capacity ceiling. */
function migrateV16ToV17(document: Record<string, unknown>): Record<string, unknown> {
  const world = (document.world ?? {}) as {
    woodDeposits?: Array<{ x: number; y: number; amount: number }>;
    stoneDeposits?: Array<{ x: number; y: number; amount: number }>;
  };
  const withCapacities = (
    deposits: unknown,
    seeds: Array<{ x: number; y: number; amount: number }> | undefined,
    label: string,
  ): Record<string, unknown> => {
    // A missing/corrupt deposits record is invalid input, not an empty
    // colony: healing it as {} would load with zero deposits silently.
    if (!isRecord(deposits)) throw new SaveValidationError(`${label} missing or corrupt (v16)`);
    const capacities = depositCapacities(seeds ?? []);
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(deposits)) {
      const entry = (raw ?? {}) as { remaining?: unknown };
      out[key] = { remaining: entry.remaining, capacity: capacities[key] ?? entry.remaining ?? 0 };
    }
    return out;
  };
  const deposits = (document.deposits ?? {}) as Record<string, unknown>;
  return {
    ...document,
    // Tier1: literal version, matching the idiom of the sibling migrations —
    // referencing SAVE_VERSION here would silently mislabel if it ever moved.
    formatVersion: 17,
    deposits: {
      wood: withCapacities(deposits.wood, world.woodDeposits, "save.deposits.wood"),
      stone: withCapacities(deposits.stone, world.stoneDeposits, "save.deposits.stone"),
    },
  };
}

export function parseSaveString(text: string): GameState {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new SaveValidationError("save is not valid JSON");
  }
  return parseSave(document);
}

// --- strict shape guards -------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new SaveValidationError(`${field} must be a string`);
  return value;
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new SaveValidationError(`${field} must be a boolean`);
  return value;
}

function expectInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new SaveValidationError(`${field} must be an integer`);
  }
  return value;
}

function expectPositiveInt(value: unknown, field: string): number {
  const n = expectInt(value, field);
  if (n < 1) throw new SaveValidationError(`${field} must be >= 1`);
  return n;
}

function expectNonNegativeInt(value: unknown, field: string): number {
  const n = expectInt(value, field);
  if (n < 0) throw new SaveValidationError(`${field} must be >= 0`);
  return n;
}

function expectNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SaveValidationError(`${field} must be a finite number >= 0`);
  }
  return value;
}

function expectDepositSeeds(
  value: unknown,
  field: string,
): Array<{ x: number; y: number; amount: number }> {
  if (!Array.isArray(value)) throw new SaveValidationError(`${field} must be an array`);
  return value.map((entry, i) => {
    if (!isRecord(entry)) throw new SaveValidationError(`${field}[${i}] must be an object`);
    return {
      x: expectInt(entry.x, `${field}[${i}].x`),
      y: expectInt(entry.y, `${field}[${i}].y`),
      amount: expectNonNegativeNumber(entry.amount, `${field}[${i}].amount`),
    };
  });
}

function expectCellKeyArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new SaveValidationError(`${field} must be an array`);
  for (const entry of value) {
    if (typeof entry !== "string") throw new SaveValidationError(`${field} entries must be strings`);
    try {
      parseCellKey(entry);
    } catch {
      throw new SaveValidationError(`${field} contains an invalid cell key: ${entry}`);
    }
  }
  return value;
}

function expectDeposits(value: unknown, field: string): Deposits {
  if (!isRecord(value)) throw new SaveValidationError(`${field} must be an object`);
  const deposits: Deposits = {};
  for (const [key, raw] of Object.entries(value)) {
    try {
      parseCellKey(key);
    } catch {
      throw new SaveValidationError(`${field} has an invalid cell key: ${key}`);
    }
    if (!isRecord(raw)) throw new SaveValidationError(`${field}.${key} must be an object`);
    const remaining = expectNonNegativeNumber(raw.remaining, `${field}.${key}.remaining`);
    const capacity = expectNonNegativeNumber(raw.capacity, `${field}.${key}.capacity`);
    // Tier1: a deposit can never hold more than its regrowth ceiling —
    // remaining > capacity is corrupt, not a plausible state.
    if (remaining > capacity) {
      throw new SaveValidationError(`${field}.${key}.remaining exceeds capacity`);
    }
    deposits[key] = { remaining, capacity };
  }
  return deposits;
}
