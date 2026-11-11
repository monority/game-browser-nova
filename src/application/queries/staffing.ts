import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import type { BuildingType } from "@/content/buildings.js";
import { isEligibleWorkplace } from "@/domain/jobs/jobs.js";
import { compareCellsWithId } from "@/domain/shared/cells.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";

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

type StaffingState = "staffed" | "idle" | "mothballed" | "no-road" | "under-construction";

type IdleReason = "no-workers" | "no-road" | "mothballed" | "under-construction" | null;

interface StaffingEntry {
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

interface StaffingOverview {
  /** Colonists available to work (population). */
  workers: number;
  /** Workplaces competing for workers (matches assignJobs eligibility). */
  eligible: number;
  staffed: number;
  /** Operational workplaces no road reaches (a fixable access defect). */
  unconnected: number;
  /** Eligible workplaces in staffing rank order first, then the rest in canonical order. */
  entries: StaffingEntry[];
}

export function getStaffingOverview(state: GameState): StaffingOverview {
  const workplaces = Object.values(state.buildings)
    .filter((b) => BUILDING_DEFINITIONS[b.type].jobCapacity > 0)
    .sort(compareCellsWithId);

  const eligible = workplaces.filter((b) => isEligibleWorkplace(state, b));

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
  const unranked = entries.filter((e) => e.order === null).sort(compareCellsWithId);

  return {
    workers: state.population,
    eligible: eligible.length,
    staffed: staffedIds.size,
    unconnected: entries.filter((e) => e.reason === "no-road").length,
    entries: [...ranked, ...unranked],
  };
}

function ineligible(
  building: Building,
  state: StaffingState,
  reason: IdleReason,
  staffingLine: string,
): StaffingEntry {
  return { id: building.id, type: building.type, x: building.x, y: building.y, order: null, state, reason, staffingLine };
}
