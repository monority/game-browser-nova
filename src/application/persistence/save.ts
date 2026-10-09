import { BUILDING_DEFINITIONS, type BuildingType } from "../../content/buildings.js";
import { parseCellKey } from "../../domain/shared/cells.js";
import type { Building, BuildingStatus } from "../../domain/building/building.js";
import type { Road } from "../../domain/road/road.js";
import type { Deposits } from "../../domain/world/deposits.js";
import { createWorld } from "../../domain/world/world.js";
import type { GameState } from "../../domain/simulation/state.js";
import type { ResourceStock } from "../../domain/resource/resource.js";
import type { WorldConfig } from "../../domain/world/world.js";

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

export const SAVE_VERSION = 13;

export interface SaveDocument {
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
  tick: number;
  resources: ResourceStock;
  population: number;
  buildings: Building[];
  roads: Road[];
  buildingCounter: number;
  roadCounter: number;
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
    deposits: { wood: state.woodDeposits, stone: state.stoneDeposits },
    tick: state.tick,
    resources: { ...state.resources },
    population: state.population,
    buildings: Object.values(state.buildings).map((b) => ({ ...b })),
    roads: Object.values(state.roads).map((r) => ({ id: r.id, cells: [...r.cells] })),
    buildingCounter: state.buildingCounter,
    roadCounter: state.roadCounter,
  };
}

export function parseSave(document: unknown): GameState {
  if (!isRecord(document)) throw new SaveValidationError("save is not an object");
  if (document.formatVersion !== SAVE_VERSION) {
    throw new SaveValidationError(
      `unsupported save version: ${String(document.formatVersion)} (expected ${SAVE_VERSION})`,
    );
  }

  const world = document.world;
  if (!isRecord(world)) throw new SaveValidationError("save.world missing");
  const config: WorldConfig = {
    seed: expectString(world.seed, "world.seed"),
    width: expectPositiveInt(world.width, "world.width"),
    height: expectPositiveInt(world.height, "world.height"),
    blockedCells: expectCellKeyArray(world.blockedCells, "world.blockedCells"),
    woodDeposits: expectDepositSeeds(world.woodDeposits, "world.woodDeposits"),
    stoneDeposits: expectDepositSeeds(world.stoneDeposits, "world.stoneDeposits"),
  };
  const generated = createWorld(config); // deterministic regeneration (ADR-005)

  const deposits = document.deposits;
  if (!isRecord(deposits)) throw new SaveValidationError("save.deposits missing");
  const woodDeposits = expectDeposits(deposits.wood, "deposits.wood");
  const stoneDeposits = expectDeposits(deposits.stone, "deposits.stone");

  const resources = document.resources;
  if (!isRecord(resources)) throw new SaveValidationError("save.resources missing");
  const stock: ResourceStock = {
    food: expectNonNegativeNumber(resources.food, "resources.food"),
    water: expectNonNegativeNumber(resources.water, "resources.water"),
    money: expectNonNegativeNumber(resources.money, "resources.money"),
    wood: expectNonNegativeNumber(resources.wood, "resources.wood"),
    stone: expectNonNegativeNumber(resources.stone, "resources.stone"),
    planks: expectNonNegativeNumber(resources.planks, "resources.planks"),
  };

  if (!Array.isArray(document.buildings)) {
    throw new SaveValidationError("save.buildings must be an array");
  }
  const buildings: Record<string, Building> = {};
  for (const raw of document.buildings) {
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
    buildings[id] = {
      id,
      type,
      x: expectNonNegativeInt(raw.x, "building.x"),
      y: expectNonNegativeInt(raw.y, "building.y"),
      status,
      constructionTicksLeft: expectNonNegativeInt(
        raw.constructionTicksLeft,
        "building.constructionTicksLeft",
      ),
      staffed: expectBoolean(raw.staffed, "building.staffed"),
    };
  }
  if (!buildings["colony-center"]) {
    throw new SaveValidationError("save is missing the Colony Center anchor");
  }

  if (!Array.isArray(document.roads)) throw new SaveValidationError("save.roads must be an array");
  const roads: Record<string, Road> = {};
  for (const raw of document.roads) {
    if (!isRecord(raw)) throw new SaveValidationError("road must be an object");
    const id = expectString(raw.id, "road.id");
    if (roads[id]) throw new SaveValidationError(`duplicate road id: ${id}`);
    roads[id] = { id, cells: expectCellKeyArray(raw.cells, "road.cells") };
  }

  const population = expectNonNegativeInt(document.population, "population");
  const tick = expectNonNegativeInt(document.tick, "tick");
  const buildingCounter = expectPositiveInt(document.buildingCounter, "buildingCounter");
  const roadCounter = expectPositiveInt(document.roadCounter, "roadCounter");

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
    buildingCounter,
    roadCounter,
  };
}

export function saveToString(state: GameState): string {
  return JSON.stringify(serialize(state));
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
    deposits[key] = { remaining: expectNonNegativeNumber(raw.remaining, `${field}.${key}.remaining`) };
  }
  return deposits;
}
