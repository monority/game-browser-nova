import { cellKey } from "../shared/cells.js";
import { createRng, hashString } from "../shared/rng.js";

/** World generation parameters (ADR-005: deterministic from seed + parameters). */
export interface WorldConfig {
  seed: string;
  width: number;
  height: number;
  /** Explicitly blocked cells from configuration, normalized + deduped. */
  blockedCells?: readonly string[];
}

export interface World {
  seed: string;
  width: number;
  height: number;
  /** All non-passable cells, cell-keyed. */
  blockedCells: Record<string, true>;
}

export interface NormalizedWorldConfig {
  seed: string;
  width: number;
  height: number;
  blockedCells: readonly string[];
}

export function normalizeWorldConfig(config: WorldConfig): NormalizedWorldConfig {
  if (!Number.isInteger(config.width) || config.width < 1) {
    throw new Error(`world width must be a positive integer, got ${config.width}`);
  }
  if (!Number.isInteger(config.height) || config.height < 1) {
    throw new Error(`world height must be a positive integer, got ${config.height}`);
  }
  const seen = new Set<string>();
  const blocked: string[] = [];
  for (const key of config.blockedCells ?? []) {
    if (!seen.has(key)) {
      seen.add(key);
      blocked.push(key);
    }
  }
  return {
    seed: config.seed,
    width: config.width,
    height: config.height,
    blockedCells: blocked,
  };
}

export function createWorld(config: WorldConfig): World {
  const normalized = normalizeWorldConfig(config);
  const rng = createRng(hashString(normalized.seed) ^ 0x5e2d);
  const blockedCells: Record<string, true> = {};

  for (const key of normalized.blockedCells) {
    const { x, y } = parseOrThrow(key);
    if (!inBounds(x, y, normalized)) {
      throw new Error(`blocked cell out of bounds: ${key}`);
    }
    blockedCells[key] = true;
  }

  // Seeded terrain obstacles: deterministic density, no clustering pass (MVP).
  const obstacleCount = Math.floor(normalized.width * normalized.height * 0.06);
  for (let i = 0; i < obstacleCount; i++) {
    const x = Math.floor(rng() * normalized.width);
    const y = Math.floor(rng() * normalized.height);
    blockedCells[cellKey(x, y)] = true;
  }

  return {
    seed: normalized.seed,
    width: normalized.width,
    height: normalized.height,
    blockedCells,
  };
}

export function inBounds(x: number, y: number, world: { width: number; height: number }): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function isBlocked(world: World, x: number, y: number): boolean {
  return world.blockedCells[cellKey(x, y)] === true;
}

function parseOrThrow(key: string): { x: number; y: number } {
  const i = key.indexOf(",");
  if (i < 0) throw new Error(`invalid blocked cell key: ${key}`);
  const x = Number(key.slice(0, i));
  const y = Number(key.slice(i + 1));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`invalid blocked cell key: ${key}`);
  }
  return { x, y };
}
