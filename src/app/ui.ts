import type { BuildingType } from "../content/buildings.js";
import type { ColonyStats } from "../application/queries/stats.js";
import type { ResourceContributors, ResourceForecast, Alert, SurvivalResource } from "../application/queries/analysis.js";
import type { OverlayMode } from "../renderer/overlay.js";
import { createStatsPanel } from "./ui/statsPanel.js";
import { createControlsPanel } from "./ui/controlsPanel.js";
import { createInspectionPanel, type InspectionInfo, type RemoveBuildingInfo, type RemoveRoadInfo } from "./ui/inspectionPanel.js";
import { createProgressionPanel, type ProgressionInfo } from "./ui/progressionPanel.js";

/**
 * DOM UI (presentation only): displays derived state, collects player
 * intent, dispatches commands. No simulation rules live here.
 *
 * Step029 split: panels live in ./ui/ (stats, controls, inspection,
 * progression); this module is the thin orchestrator that assembles
 * them, owns the status line and the hover tooltip, and exposes the
 * stable Ui facade used by the app entry (main.ts).
 */

export type { InspectionInfo, RemoveBuildingInfo, RemoveRoadInfo };

export interface Ui {
  root: HTMLDivElement;
  updateStats(stats: ColonyStats): void;
  updateProgression(info: ProgressionInfo): void;
  updateForecast(forecasts: ResourceForecast[]): void;
  setAlerts(alerts: Alert[]): void;
  setStatus(message: string): void;
  showTooltip(text: string | null, clientX?: number, clientY?: number): void;
  showDrillDown(info: ResourceContributors | null): void;
  showInspection(info: InspectionInfo): void;
  activeBuildType(): BuildingType | null;
  roadMode(): boolean;
  setAvailableBuildings(types: BuildingType[]): void;
  /** Buildings that exist in the palette but are locked behind a later age. */
  setAgeLocked(types: BuildingType[]): void;
}

export interface UiCallbacks {
  onBuildTypeSelected(type: BuildingType | null): void;
  onRoadModeToggled(enabled: boolean): void;
  onSpeedChanged(ticksPerSecond: number, id: string): void;
  onSave(): void;
  onLoad(): void;
  onRemoveBuilding(id: string): void;
  onRemoveRoadCell(cell: string): void;
  onSetBuildingActive(id: string, active: boolean): void;
  onOverlayChanged(mode: OverlayMode): void;
  onForecastRowClick(resource: SurvivalResource): void;
  onResearchTech(techId: string): void;
  onAdvanceAge(): void;
}

export function createUi(container: HTMLElement, callbacks: UiCallbacks): Ui {
  const root = document.createElement("div");
  root.id = "ui";
  container.appendChild(root);

  const stats = createStatsPanel({ onForecastRowClick: callbacks.onForecastRowClick });
  const controls = createControlsPanel({
    onBuildTypeSelected: callbacks.onBuildTypeSelected,
    onRoadModeToggled: callbacks.onRoadModeToggled,
    onSpeedChanged: callbacks.onSpeedChanged,
    onSave: callbacks.onSave,
    onLoad: callbacks.onLoad,
    onOverlayChanged: callbacks.onOverlayChanged,
  });
  const inspection = createInspectionPanel({
    onRemoveBuilding: callbacks.onRemoveBuilding,
    onRemoveRoadCell: callbacks.onRemoveRoadCell,
    onSetBuildingActive: callbacks.onSetBuildingActive,
  });
  const progression = createProgressionPanel({
    onResearchTech: callbacks.onResearchTech,
    onAdvanceAge: callbacks.onAdvanceAge,
  });
  root.append(stats.element, controls.element, inspection.element, progression.element);

  // --- status line -------------------------------------------------------------
  const status = document.createElement("div");
  status.className = "nova-status";
  root.appendChild(status);

  // --- hover tooltip -----------------------------------------------------------
  const tooltip = document.createElement("div");
  tooltip.className = "nova-tooltip";
  tooltip.hidden = true;
  root.appendChild(tooltip);

  return {
    root,
    updateStats: stats.updateStats,
    updateForecast: stats.updateForecast,
    setAlerts: stats.setAlerts,
    updateProgression: progression.update,
    showInspection: inspection.showInspection,
    showDrillDown: inspection.showDrillDown,
    activeBuildType: controls.activeBuildType,
    roadMode: controls.roadMode,
    setAvailableBuildings: controls.setAvailableBuildings,
    setAgeLocked: controls.setAgeLocked,
    setStatus(message: string) {
      status.textContent = message;
    },
    showTooltip(text, clientX, clientY) {
      if (!text || clientX === undefined || clientY === undefined) {
        tooltip.hidden = true;
        return;
      }
      tooltip.textContent = text;
      tooltip.style.left = `${clientX + 14}px`;
      tooltip.style.top = `${clientY + 14}px`;
      tooltip.hidden = false;
    },
  };
}
