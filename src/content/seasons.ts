/**
 * The year (Step070, gameplay): four seasons of fifteen ticks, one of them lean.
 *
 * Only the harvest is seasonal, and only in the lean season. Why it exists —
 * with the market gone, a colony at exact balance had nothing to store and
 * nothing to decide: the surplus was destroyed every tick and no building could
 * buy it back. A season that takes food away gives the granary a job, because
 * it makes "produce more than you eat" a plan instead of a waste.
 *
 * The lean season does NOT shut a fixed share of the farms, because that kills.
 * Measured on the self-play line, a fixed half at pop 24 is a 17/tick deficit
 * for fifteen ticks — 255 units plus 3%/tick conservation against a granary
 * that holds 180 at best, so the colony starved every spring (pop 24 → 15). The
 * rule that cannot starve is the one the fiction already implies: THE COLONY
 * FARMS WHAT ITS GRANARY CAN AFFORD. Winter parks up to half the farms, scaled
 * by how full the granary is, so as the stock falls the farms wake up on their
 * own and the store settles instead of emptying. The season costs the player a
 * dip they plan for, never a colony they lose.
 */
export interface SeasonDefinition {
  id: "spring" | "summer" | "autumn" | "winter";
  label: string;
  /** Ticks this season lasts; the year is four of them. */
  ticks: number;
  /** The lean season: farms rest as far as the granary allows. */
  lean: boolean;
}

export const SEASON_LENGTH_TICKS = 15;

/** Canonical order; the year starts at `tick` 0 in the first entry. */
export const SEASONS: readonly SeasonDefinition[] = [
  { id: "spring", label: "Spring", ticks: SEASON_LENGTH_TICKS, lean: false },
  { id: "summer", label: "Summer", ticks: SEASON_LENGTH_TICKS, lean: false },
  { id: "autumn", label: "Autumn", ticks: SEASON_LENGTH_TICKS, lean: false },
  { id: "winter", label: "Winter", ticks: SEASON_LENGTH_TICKS, lean: true },
];

/**
 * Share of the staffed farms that rest in the lean season, at a granary that
 * can afford it. Halved again by the affordability below.
 */
export const LEAN_SEASON_IDLE_FARM_SHARE = 0.5;

/**
 * The granary level, as a share of its capacity, at which the colony rests the
 * full lean-season share. Below it the parked farms scale down linearly, so a
 * colony entering winter at 108 food (of 180) parks everything, and one at 54
 * parks half of that. Measured so the store never reaches the starvation band.
 */
export const LEAN_SEASON_AFFORDABLE_STOCK_SHARE = 0.6;
