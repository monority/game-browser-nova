import type { GameState } from "@/domain/simulation/state.js";
import type { Building } from "@/domain/building/building.js";
import { cellKey } from "@/domain/shared/cells.js";
import { isActive } from "@/domain/building/building.js";
import {
  FOOD_PER_COLONIST_PER_TICK,
  WATER_PER_SERVED_COLONIST_PER_TICK,
  WATER_PER_WELL_PER_TICK,
  foodProductionPerTick,
} from "@/domain/production/production.js";
import { expectedMarketSales } from "@/domain/economy/economy.js";
import {
  ENV_QUALITY_ALERT_THRESHOLD,
  environmentalQuality,
} from "@/domain/environment/environment.js";

/**
 * Overlay state mapping (presentation logic, no Three.js here — pure and
 * unit-testable). Overlays tint buildings to expose a bottleneck.
 */

export type OverlayMode = "none" | "staffing" | "deposits" | "food" | "water" | "pollution";

export type OverlayTint = "ok" | "warn" | "off";

export interface OverlayCell {
  key: string;
  tint: OverlayTint;
}

/** Food balance the colony currently runs on (same math as the forecast). */
function foodBalance(state: GameState): number {
  const consumption = state.population * FOOD_PER_COLONIST_PER_TICK;
  return foodProductionPerTick(state) - consumption - expectedMarketSales(state);
}

/** Water balance: staffed active wells vs. the whole population's need. */
function waterBalance(state: GameState): number {
  let production = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.type === "well" && isActive(building) && building.staffed) {
      production += WATER_PER_WELL_PER_TICK;
    }
  }
  return production - state.population * WATER_PER_SERVED_COLONIST_PER_TICK;
}

function tintOf(building: Building): string {
  return cellKey(building.x, building.y);
}

/**
 * Overlay mapping per mode. Under-construction buildings never tint
 * (no data yet — same convention as staffing).
 * - staffing: workplaces by staffing state (ok staffed · warn idle · off mothballed)
 * - deposits: no building tints (deposit markers carry the data)
 * - food: farms show the colony food balance (ok ≥ 0 · warn < 0 · off not producing)
 * - water: wells show the colony water balance (ok ≥ 0 · warn < 0 · off not producing)
 * - pollution: emitters (workshop/quarry) show the environmental quality
 *   (ok clean ≥ threshold · warn dirty < threshold · off inactive);
 *   parks are ok while active, off when mothballed. Nothing else tints.
 */
export function computeOverlay(state: GameState, mode: OverlayMode): OverlayCell[] {
  if (mode === "none") return [];

  const cells: OverlayCell[] = [];
  if (mode === "food") {
    const balance = foodBalance(state);
    for (const building of Object.values(state.buildings)) {
      if (building.type !== "farm" || building.status !== "operational") continue;
      if (!isActive(building) || !building.staffed) {
        cells.push({ key: tintOf(building), tint: "off" });
      } else {
        cells.push({ key: tintOf(building), tint: balance < 0 ? "warn" : "ok" });
      }
    }
    return cells;
  }
  if (mode === "water") {
    const balance = waterBalance(state);
    for (const building of Object.values(state.buildings)) {
      if (building.type !== "well" || building.status !== "operational") continue;
      if (!isActive(building) || !building.staffed) {
        cells.push({ key: tintOf(building), tint: "off" });
      } else {
        cells.push({ key: tintOf(building), tint: balance < 0 ? "warn" : "ok" });
      }
    }
    return cells;
  }
  if (mode === "pollution") {
    // mirrors the getAlerts "Environment" threshold (single domain source)
    const dirty = environmentalQuality(state) < ENV_QUALITY_ALERT_THRESHOLD;
    for (const building of Object.values(state.buildings)) {
      if (building.status !== "operational") continue;
      if (building.type === "workshop" || building.type === "quarry") {
        // emission logic keys on active only (environment.ts updateEnvironment)
        cells.push({ key: tintOf(building), tint: isActive(building) ? (dirty ? "warn" : "ok") : "off" });
      } else if (building.type === "park") {
        cells.push({ key: tintOf(building), tint: isActive(building) ? "ok" : "off" });
      }
    }
    return cells;
  }

  for (const building of Object.values(state.buildings)) {
    if (mode === "staffing") {
      const isWorkplace = building.type !== "residence" && building.type !== "colonyCenter";
      if (!isWorkplace) continue;
      if (!building.active) {
        cells.push({ key: tintOf(building), tint: "off" });
      } else if (building.status === "operational" && building.staffed) {
        cells.push({ key: tintOf(building), tint: "ok" });
      } else if (building.status === "operational") {
        cells.push({ key: tintOf(building), tint: "warn" });
      }
      // under-construction workplaces are not tinted yet
    }
    // "deposits" mode has no building tints (deposit markers carry the data)
  }
  return cells;
}
