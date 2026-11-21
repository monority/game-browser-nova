import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { isActive } from "@/domain/building/building.js";
import { cellKey, compareCellsWithId, orthogonalNeighbors } from "@/domain/shared/cells.js";
import type { Deposits } from "@/domain/world/deposits.js";
import { extractAdjacent, regrowAdjacent } from "@/domain/world/deposits.js";
import { buildLogisticsMap } from "@/domain/logistics/logistics.js";
import {
  WOOD_PER_COLONY_CENTER_PER_TICK,
  WOOD_PER_LUMBER_CAMP_PER_TICK,
  projectedExtraction,
} from "@/domain/production/extraction.js";

/**
 * The wood system, in one place (2026-11-21).
 *
 * Before this module the wood law had three homes and no view: the camp yield
 * lived in `production/extraction.ts`, the park regrowth in
 * `environment/environment.ts`, the deposit bookkeeping in `world/deposits.ts`,
 * and nothing ever stated the colony's wood as a whole. The consequence was
 * measured twice on this sandbox:
 *
 *   - the reference lines never built a camp (deposits intact, 100/100) because
 *     nothing told the player the forest was a finite, renewable budget;
 *   - the Colony Center's own +1 wood/tick yields **nothing** when no deposit is
 *     orthogonal to the anchor — a producer silently at zero, reported by no
 *     surface. On the shipped default world the anchor sits at (23,23) with no
 *     deposit in reach, so the promised trickle is dead.
 *
 * This module is a PROJECTION, never a second law: extraction is the phase's own
 * `projectedExtraction` (logistics share, capped by reach), regrowth is the
 * phase's own `regrowAdjacent`, both applied in the tick's own order — extract
 * first, then regrow — on a clone of the deposits. The countdown walks that
 * order until the ground is empty, so it cannot promise a horizon the tick
 * would not deliver.
 */

/** Wood regrown per active park per tick into adjacent deposits (Step018). */
export const WOOD_REGROWTH_PER_PARK_PER_TICK = 1;

export interface WoodSite {
  id: string;
  /** The anchor trickles without a worker; a camp does not. */
  kind: "lumberCamp" | "colonyCenter";
  x: number;
  y: number;
  /** Wood orthogonally reachable right now. */
  adjacent: number;
  /** What the phase would take from this site next tick (0 when unstaffed). */
  perTick: number;
  /** False for an unstaffed camp: it holds no worker, so nothing is wasted. */
  staffed: boolean;
}

export interface ParkSite {
  id: string;
  x: number;
  y: number;
  /** Headroom under capacity in reach — what a park could still grow into. */
  room: number;
  regrowsPerTick: number;
  /** False when no deposit is orthogonal to the park: it grows nothing here. */
  inReach: boolean;
}

export interface ForestProjection {
  /** Wood left in the ground, and its seeded ceiling. */
  remaining: number;
  capacity: number;
  /** What leaves the ground next tick (staffed camps + a reachable anchor). */
  extractionPerTick: number;
  /** What the parks put back next tick, capped by room. */
  regrowthPerTick: number;
  /** regrowth − extraction: the ground's real per-tick change. */
  netPerTick: number;
  /**
   * Ticks until the ground is empty under the tick's own order. Null when the
   * forest never empties (regrowth covers extraction) — a steady state, not a
   * guarantee: it lasts only while the parks and camps stay where they are.
   */
  ticksToEmpty: number | null;
  sites: WoodSite[];
  parks: ParkSite[];
  /** Staffed camps with nothing in reach: a worker held for no output. */
  starvedCamps: number;
  /** Parks with no deposit in reach: their regrowth line is a dead promise. */
  idleParks: number;
  /**
   * The anchor's trickle is real but unreachable in this world — the case the
   * default map produces, and the reason nothing was ever extracted by it.
   */
  centerBlocked: boolean;
}

/** Wood on the four cells orthogonal to (x, y). */
export function adjacentWood(deposits: Deposits, x: number, y: number): number {
  let total = 0;
  for (const { x: nx, y: ny } of orthogonalNeighbors(x, y)) {
    total += deposits[cellKey(nx, ny)]?.remaining ?? 0;
  }
  return total;
}

/** Headroom under capacity on the four cells orthogonal to (x, y). */
function adjacentRoom(deposits: Deposits, x: number, y: number): number {
  let total = 0;
  for (const { x: nx, y: ny } of orthogonalNeighbors(x, y)) {
    const deposit = deposits[cellKey(nx, ny)];
    if (deposit) total += Math.max(0, deposit.capacity - deposit.remaining);
  }
  return total;
}

function cloneDeposits(deposits: Deposits): Deposits {
  const clone: Deposits = {};
  for (const [key, deposit] of Object.entries(deposits)) clone[key] = { ...deposit };
  return clone;
}

function remainingOf(deposits: Deposits): number {
  let total = 0;
  for (const deposit of Object.values(deposits)) total += deposit.remaining;
  return total;
}

/** Buildings the wood system reads, in the canonical order every phase uses. */
function woodBuildings(state: GameState): Building[] {
  return Object.values(state.buildings)
    .filter((b) => isActive(b) && (b.type === "lumberCamp" || b.type === "colonyCenter"))
    .sort(compareCellsWithId);
}

function parkBuildings(state: GameState): Building[] {
  return Object.values(state.buildings)
    .filter((b) => isActive(b) && b.type === "park")
    .sort(compareCellsWithId);
}

export function woodSites(state: GameState): WoodSite[] {
  const map = buildLogisticsMap(state);
  return woodBuildings(state).map((building) => {
    if (building.type === "colonyCenter") {
      const adjacent = adjacentWood(state.woodDeposits, building.x, building.y);
      return {
        id: building.id,
        kind: "colonyCenter" as const,
        x: building.x,
        y: building.y,
        adjacent,
        perTick: Math.min(WOOD_PER_COLONY_CENTER_PER_TICK, adjacent),
        staffed: true,
      };
    }
    const adjacent = adjacentWood(state.woodDeposits, building.x, building.y);
    return {
      id: building.id,
      kind: "lumberCamp" as const,
      x: building.x,
      y: building.y,
      adjacent,
      perTick: building.staffed
        ? projectedExtraction(
            state,
            building,
            state.woodDeposits,
            WOOD_PER_LUMBER_CAMP_PER_TICK,
            map,
          )
        : 0,
      staffed: building.staffed,
    };
  });
}

/**
 * Parks read against a given deposit map. The caller passes the map the phase
 * will see at that moment: `forestProjection` passes the post-extraction clone,
 * because the tick extracts before it regrows and a park tending a FULL deposit
 * has room only once the camp has opened some.
 */
export function parkSites(state: GameState, deposits: Deposits = state.woodDeposits): ParkSite[] {
  return parkBuildings(state).map((building) => {
    const room = adjacentRoom(deposits, building.x, building.y);
    const inReach = orthogonalNeighbors(building.x, building.y).some(
      ({ x, y }) => deposits[cellKey(x, y)] !== undefined,
    );
    return {
      id: building.id,
      x: building.x,
      y: building.y,
      room,
      regrowsPerTick: Math.min(WOOD_REGROWTH_PER_PARK_PER_TICK, room),
      inReach,
    };
  });
}

/**
 * The colony's wood budget: one tick, then the countdown, both on a clone.
 *
 * The countdown is not `remaining / extraction`: parks refill cells toward
 * capacity while camps drain them, so the net rate changes as cells empty. It
 * walks the real order instead (camps in canonical order, then parks), which is
 * also the order the tick applies.
 */
export function forestProjection(state: GameState): ForestProjection {
  const map = buildLogisticsMap(state);
  const camps = woodBuildings(state).filter((b) => b.type === "lumberCamp");
  const anchor = woodBuildings(state).find((b) => b.type === "colonyCenter");
  const parks = parkBuildings(state);

  /** Phase 3 on a clone: staffed camps in canonical order, then the anchor. */
  const extractInto = (deposits: Deposits): number => {
    let taken = 0;
    for (const camp of camps) {
      if (!camp.staffed) continue;
      // The same bound the phase uses, read against the clone as it drains:
      // two camps on one deposit cannot each count the same remainder twice.
      const share = projectedExtraction(
        state,
        camp,
        deposits,
        WOOD_PER_LUMBER_CAMP_PER_TICK,
        map,
      );
      taken += extractAdjacent(deposits, camp.x, camp.y, share);
    }
    if (anchor) {
      taken += extractAdjacent(deposits, anchor.x, anchor.y, WOOD_PER_COLONY_CENTER_PER_TICK);
    }
    return taken;
  };

  /** The environment phase on a clone: parks tend what the extraction opened. */
  const regrowInto = (deposits: Deposits): number => {
    let grown = 0;
    for (const park of parks) {
      grown += regrowAdjacent(deposits, park.x, park.y, WOOD_REGROWTH_PER_PARK_PER_TICK);
    }
    return grown;
  };

  const clone = cloneDeposits(state.woodDeposits);
  const extractionPerTick = extractInto(clone);
  // Park room is read AFTER extraction: the tick opens the room it fills.
  const parkList = parkSites(state, clone);
  const regrowthPerTick = regrowInto(clone);
  const netPerTick = regrowthPerTick - extractionPerTick;

  const remaining = remainingOf(state.woodDeposits);
  let capacity = 0;
  for (const deposit of Object.values(state.woodDeposits)) capacity += deposit.capacity;

  let ticksToEmpty: number | null = null;
  if (netPerTick < 0) {
    const walk = cloneDeposits(state.woodDeposits);
    let ticks = 0;
    let previous = remainingOf(walk);
    // A ground can settle above zero: one park against one camp leaves exactly
    // the last unit in place every tick (extract 1, regrow 1). That fixed point
    // is a sustainable forest, not a countdown, so the walk stops when the stock
    // stops moving instead of running to the iteration cap.
    while (previous > 0 && ticks < 10000) {
      extractInto(walk);
      regrowInto(walk);
      ticks += 1;
      const now = remainingOf(walk);
      if (now >= previous) {
        previous = now;
        break;
      }
      previous = now;
    }
    ticksToEmpty = previous > 0 ? null : ticks;
  }

  const sites = woodSites(state);

  return {
    remaining,
    capacity,
    extractionPerTick,
    regrowthPerTick,
    netPerTick,
    ticksToEmpty,
    sites,
    parks: parkList,
    starvedCamps: sites.filter(
      (site) => site.kind === "lumberCamp" && site.staffed && site.adjacent === 0,
    ).length,
    idleParks: parkList.filter((park) => !park.inReach).length,
    centerBlocked: sites.some((site) => site.kind === "colonyCenter" && site.adjacent === 0),
  };
}
