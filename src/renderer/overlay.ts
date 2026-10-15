import type { GameState } from "@/domain/simulation/state.js";
import { cellKey } from "@/domain/shared/cells.js";

/**
 * Overlay state mapping (presentation logic, no Three.js here — pure and
 * unit-testable). Overlays tint buildings to expose a bottleneck.
 */

export type OverlayMode = "none" | "staffing" | "deposits";

export type OverlayTint = "ok" | "warn" | "off";

export interface OverlayCell {
  key: string;
  tint: OverlayTint;
}

/**
 * Staffing overlay: workplaces tinted by staffing state.
 * - ok (green): staffed and producing
 * - warn (amber): idle — needs a colonist or road access
 * - off (gray): mothballed
 * Non-workplaces and the anchor are not tinted.
 */
export function computeOverlay(state: GameState, mode: OverlayMode): OverlayCell[] {
  if (mode === "none") return [];

  const cells: OverlayCell[] = [];
  for (const building of Object.values(state.buildings)) {
    if (mode === "staffing") {
      const isWorkplace = building.type !== "residence" && building.type !== "colonyCenter";
      if (!isWorkplace) continue;
      if (!building.active) {
        cells.push({ key: cellKey(building.x, building.y), tint: "off" });
      } else if (building.status === "operational" && building.staffed) {
        cells.push({ key: cellKey(building.x, building.y), tint: "ok" });
      } else if (building.status === "operational") {
        cells.push({ key: cellKey(building.x, building.y), tint: "warn" });
      }
      // under-construction workplaces are not tinted yet
    }
    // "deposits" mode has no building tints (deposit markers carry the data)
  }
  return cells;
}
