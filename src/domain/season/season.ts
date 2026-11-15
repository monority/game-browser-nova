import type { GameState } from "@/domain/simulation/state.js";
import { SEASONS, SEASON_LENGTH_TICKS, type SeasonDefinition } from "@/content/seasons.js";

/**
 * Season readings (Step070). Derived from `state.tick` only: the calendar is a
 * fact of the clock, never a stored field, so an old save keeps the same season
 * and no migration is needed.
 */

/** 0-based index in `SEASONS`; the year starts at tick 0. */
export function seasonIndexOf(tick: number): number {
  return Math.floor(tick / SEASON_LENGTH_TICKS) % SEASONS.length;
}

export function seasonAt(tick: number): SeasonDefinition {
  // In range by construction; the fallback keeps a hand-edited table from
  // turning the calendar into `undefined`.
  return (
    SEASONS[seasonIndexOf(tick)] ??
    SEASONS[0] ?? { id: "spring" as const, label: "Spring", ticks: SEASON_LENGTH_TICKS, lean: false }
  );
}

export function currentSeason(state: GameState): SeasonDefinition {
  return seasonAt(state.tick);
}

/** True in the lean season (the harvest runs only as far as the granary pays). */
export function isLeanSeason(tick: number): boolean {
  return seasonAt(tick).lean;
}

/** Ticks left in the current season, the current one included: 1..15. */
export function ticksLeftInSeason(tick: number): number {
  return SEASON_LENGTH_TICKS - (tick % SEASON_LENGTH_TICKS);
}
