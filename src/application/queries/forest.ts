import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import {
  WOOD_REGROWTH_PER_PARK_PER_TICK,
  forestProjection,
  type ForestProjection,
} from "@/domain/resource/forest.js";
import {
  WOOD_PER_COLONY_CENTER_PER_TICK,
  WOOD_PER_LUMBER_CAMP_PER_TICK,
} from "@/domain/production/extraction.js";
import { cellKey } from "@/domain/shared/cells.js";

/**
 * The wood reading used by the UI and the alerts (2026-11-21).
 *
 * One home for the numbers, so the panel, the alert and the hover cannot
 * disagree with the simulation — the same doctrine as the staffing and analysis
 * queries. Wording states the situation and never instructs (design rule §7).
 */

export type ForestOverview = ForestProjection;

export function getForestOverview(state: GameState): ForestOverview {
  return forestProjection(state);
}

/**
 * Wood left in one deposit cell, plus who tends it. The hover used to print a
 * bare `Wood deposit · 40`; the ceiling and the tending parks are what make the
 * budget readable (a park with no deposit in reach grows nothing, and nothing
 * used to say so).
 */
export function depositLine(state: GameState, x: number, y: number): string | undefined {
  const deposit = state.woodDeposits[cellKey(x, y)];
  if (!deposit) return undefined;
  // Local scan, not the full projection: the hover runs on every pointer move
  // and must not rebuild the logistics graph to answer one cell.
  let tending = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type !== "park" || !building.active || building.status !== "operational") continue;
    if (Math.abs(building.x - x) + Math.abs(building.y - y) === 1) tending += 1;
  }
  const room = Math.max(0, deposit.capacity - deposit.remaining);
  if (tending === 0) return `Wood deposit · ${deposit.remaining}/${deposit.capacity}`;
  const perTick = Math.min(tending * WOOD_REGROWTH_PER_PARK_PER_TICK, room);
  return `Wood deposit · ${deposit.remaining}/${deposit.capacity} · ${tending} park(s) tending${room > 0 ? ` +${perTick}/tick` : " · at capacity"}`;
}

/**
 * The inspection line for the three buildings that touch wood. Undefined for
 * everything else, so the panel only grows a row where there is something to
 * say.
 */
export function woodLine(state: GameState, building: Building): string | undefined {
  const forest = getForestOverview(state);

  if (building.type === "lumberCamp") {
    const site = forest.sites.find((s) => s.id === building.id);
    if (!site) return undefined;
    if (site.adjacent === 0) {
      return site.staffed
        ? "Wood in reach: none · 0/tick (holds a worker, produces nothing)"
        : "Wood in reach: none · 0/tick";
    }
    if (!site.staffed) return `Wood in reach: ${site.adjacent} · unstaffed`;
    return `Wood in reach: ${site.adjacent} · ${site.perTick}/${WOOD_PER_LUMBER_CAMP_PER_TICK} per tick`;
  }

  if (building.type === "colonyCenter") {
    const site = forest.sites.find((s) => s.id === building.id);
    if (!site) return undefined;
    return site.adjacent === 0
      ? `Wood trickle: no deposit in reach (0/${WOOD_PER_COLONY_CENTER_PER_TICK} per tick)`
      : `Wood trickle: ${site.adjacent} in reach · +${WOOD_PER_COLONY_CENTER_PER_TICK}/tick`;
  }

  if (building.type === "park") {
    const park = forest.parks.find((p) => p.id === building.id);
    if (!park) return undefined;
    if (!park.inReach) return "Regrowth: no wood deposit adjacent (grows nothing)";
    return `Regrowth: +${park.regrowsPerTick}/tick · ${park.room} room left in reach`;
  }

  return undefined;
}

/** The colony's forest as one line: stock, flow both ways, and the horizon. */
export function forestSummaryLine(state: GameState): string {
  const forest = getForestOverview(state);
  const horizon =
    forest.ticksToEmpty === null ? "sustainable" : `${forest.netPerTick}/tick → ${forest.ticksToEmpty} ticks`;
  return `Wood: ${forest.remaining}/${forest.capacity} in the ground · ${forest.extractionPerTick}/tick out · ${forest.regrowthPerTick}/tick regrown · ${horizon}`;
}
