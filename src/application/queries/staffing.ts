import type { GameState } from "../../domain/simulation/state.js";
import type { Building } from "../../domain/building/building.js";
import type { BuildingType } from "../../content/buildings.js";
import { isActive } from "../../domain/building/building.js";
import { isAdjacentToRoad } from "../../domain/network/network.js";
import { BUILDING_DEFINITIONS } from "../../content/buildings.js";

/**
 * Staffing visibility (Step025): a derived, read-only view of the workforce
 * assignment computed by the simulation's assignJobs phase. Presentation
 * logic only — no rule is redefined here:
 *
 * - eligible mirrors assignJobs exactly: isActive (operational + not
 *   mothballed), jobCapacity > 0, road-adjacent;
 * - rank is the canonical staffing order (y asc, x asc, id) — the greedy
 *   order workers fill in;
 * - state/reason answer "why is this workplace not staffed?" with states,
 *   never instructions (design rule §7).
 */

export type StaffingState = "staffed" | "idle" | "mothballed" | "no-road" | "under-construction";

export type IdleReason = "no-workers" | "no-road" | "mothballed" | "under-construction" | null;

export interface StaffingEntry {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  /** 1-based rank among eligible workplaces in canonical order; null when not eligible. */
  order: number | null;
  state: StaffingState;
  reason: IdleReason;
  /** Human-readable state line for inspection (states only). */
  staffingLine: string;
}

export interface StaffingOverview {
  /** Colonists available to work (population). */
  workers: number;
  /** Workplaces competing for workers (matches assignJobs eligibility). */
  eligible: number;
  staffed: number;
  /** Eligible workplaces in staffing rank order first, then the rest in canonical order. */
  entries: StaffingEntry[];
}

/** Canonical staffing order — the same comparator assignJobs sorts with. */
function canonical(a: Building, b: Building): number {
  return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
}

export function getStaffingOverview(state: GameState): StaffingOverview {
  const workplaces = Object.values(state.buildings)
    .filter((b) => BUILDING_DEFINITIONS[b.type].jobCapacity > 0)
    .sort(canonical);

  const eligible = workplaces.filter(
    (b) => isActive(b) && isAdjacentToRoad(state.roads, b.x, b.y),
  );

  // Mirror the greedy assignment: workers fill eligible workplaces in rank
  // order until the workforce is exhausted.
  const staffedIds = new Set<string>();
  let remaining = state.population;
  for (const workplace of eligible) {
    if (remaining <= 0) break;
    staffedIds.add(workplace.id);
    remaining -= BUILDING_DEFINITIONS[workplace.type].jobCapacity;
  }

  const rankById = new Map(eligible.map((b, index) => [b.id, index + 1]));
  const eligibleTotal = eligible.length;

  const entryFor = (building: Building): StaffingEntry => {
    const order = rankById.get(building.id) ?? null;
    if (order !== null) {
      if (staffedIds.has(building.id)) {
        return {
          id: building.id, type: building.type, x: building.x, y: building.y,
          order, state: "staffed", reason: null,
          staffingLine: `staffing ${order}/${eligibleTotal} · staffed`,
        };
      }
      return {
        id: building.id, type: building.type, x: building.x, y: building.y,
        order, state: "idle", reason: "no-workers",
        staffingLine: `staffing ${order}/${eligibleTotal} · idle`,
      };
    }
    if (building.status === "underConstruction") {
      return ineligible(building, "under-construction", "under-construction", "staffing · under construction");
    }
    if (!building.active) {
      return ineligible(building, "mothballed", "mothballed", "staffing · mothballed");
    }
    return ineligible(building, "no-road", "no-road", "staffing · no road access");
  };

  const entries = workplaces.map(entryFor);

  const ranked = entries
    .filter((e): e is StaffingEntry & { order: number } => e.order !== null)
    .sort((a, b) => a.order - b.order);
  const unranked = entries.filter((e) => e.order === null).sort(canonicalOfEntry);

  return {
    workers: state.population,
    eligible: eligible.length,
    staffed: staffedIds.size,
    entries: [...ranked, ...unranked],
  };
}

function canonicalOfEntry(a: StaffingEntry, b: StaffingEntry): number {
  return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);
}

function ineligible(
  building: Building,
  state: StaffingState,
  reason: IdleReason,
  staffingLine: string,
): StaffingEntry {
  return { id: building.id, type: building.type, x: building.x, y: building.y, order: null, state, reason, staffingLine };
}
