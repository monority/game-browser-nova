import type { BuildingType } from "../content/buildings.js";
import { BUILDING_DEFINITIONS } from "../content/buildings.js";
import type { ColonyStats } from "../application/queries/stats.js";

/**
 * DOM UI (presentation only): displays derived state, collects player
 * intent, dispatches commands. No simulation rules live here.
 */

export interface SpeedSetting {
  id: "pause" | "1x" | "2x" | "4x" | "8x";
  ticksPerSecond: number; // 0 for pause
}

export const SPEED_SETTINGS: SpeedSetting[] = [
  { id: "pause", ticksPerSecond: 0 },
  { id: "1x", ticksPerSecond: 2 },
  { id: "2x", ticksPerSecond: 4 },
  { id: "4x", ticksPerSecond: 8 },
  { id: "8x", ticksPerSecond: 16 },
];

const PALETTE_TYPES: BuildingType[] = [
  "residence",
  "farm",
  "well",
  "workshop",
  "lumberCamp",
  "quarry",
];

export interface Ui {
  root: HTMLDivElement;
  updateStats(stats: ColonyStats): void;
  setStatus(message: string): void;
  showInspection(buildingId: string | null): void;
  activeBuildType(): BuildingType | null;
  roadMode(): boolean;
}

export interface UiCallbacks {
  onBuildTypeSelected(type: BuildingType | null): void;
  onRoadModeToggled(enabled: boolean): void;
  onSpeedChanged(ticksPerSecond: number): void;
  onSave(): void;
  onLoad(): void;
}

export function createUi(container: HTMLElement, callbacks: UiCallbacks): Ui {
  const root = document.createElement("div");
  root.id = "ui";
  Object.assign(root.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    color: "#d8dee9",
  } satisfies Partial<CSSStyleDeclaration>);
  container.appendChild(root);

  let selectedType: BuildingType | null = null;
  let roadsEnabled = false;

  // --- stats panel ----------------------------------------------------------
  const statsPanel = panel("stats", { top: "12px", left: "12px", width: "210px" });
  root.appendChild(statsPanel.element);

  // --- palette + time controls ---------------------------------------------
  const controls = panel("controls", { bottom: "12px", left: "12px", right: "12px" });
  root.appendChild(controls.element);

  const paletteRow = document.createElement("div");
  paletteRow.style.display = "flex";
  paletteRow.style.gap = "6px";
  for (const type of PALETTE_TYPES) {
    const definition = BUILDING_DEFINITIONS[type];
    const button = document.createElement("button");
    button.dataset.buildType = type;
    button.textContent = `${definition.displayName} (${definition.moneyCost}$${definition.plankCost > 0 ? ` +${definition.plankCost}pl` : ""})`;
    styleButton(button);
    button.addEventListener("click", () => {
      selectedType = selectedType === type ? null : type;
      if (selectedType) setRoads(false);
      refreshPalette();
    });
    paletteRow.appendChild(button);
  }

  const roadButton = document.createElement("button");
  roadButton.dataset.road = "true";
  roadButton.textContent = "Road (5$/cell)";
  styleButton(roadButton);
  roadButton.addEventListener("click", () => {
    setRoads(!roadsEnabled);
    refreshPalette();
  });

  const saveButton = textButton("Save", "save", callbacks.onSave);
  const loadButton = textButton("Load", "load", callbacks.onLoad);

  const speedRow = document.createElement("div");
  speedRow.style.display = "flex";
  speedRow.style.gap = "6px";
  speedRow.style.marginTop = "6px";
  for (const setting of SPEED_SETTINGS) {
    const button = textButton(setting.id, `speed-${setting.id}`, () => {
      callbacks.onSpeedChanged(setting.ticksPerSecond);
      for (const child of speedRow.children) {
        (child as HTMLElement).style.borderColor = "#333";
      }
      button.style.borderColor = "#7fb069";
    });
    speedRow.appendChild(button);
  }

  const controlsRow = document.createElement("div");
  controlsRow.style.display = "flex";
  controlsRow.style.gap = "6px";
  controlsRow.style.flexWrap = "wrap";
  controlsRow.append(roadButton, saveButton, loadButton);
  controls.element.append(controlsRow, paletteRow, speedRow);

  // --- inspection ------------------------------------------------------------
  const inspection = panel("inspection", { top: "12px", right: "12px", width: "220px" });
  inspection.element.style.display = "none";
  root.appendChild(inspection.element);

  // --- status line -------------------------------------------------------------
  const status = document.createElement("div");
  Object.assign(status.style, {
    position: "absolute",
    bottom: "96px",
    left: "12px",
    pointerEvents: "none",
    padding: "4px 8px",
    background: "rgba(11,14,20,0.85)",
    borderRadius: "4px",
    minHeight: "18px",
  } satisfies Partial<CSSStyleDeclaration>);
  root.appendChild(status);

  function setRoads(enabled: boolean): void {
    roadsEnabled = enabled;
    if (enabled) selectedType = null;
    callbacks.onRoadModeToggled(enabled);
  }

  function refreshPalette(): void {
    for (const child of paletteRow.children) {
      const button = child as HTMLElement;
      button.style.borderColor =
        button.dataset.buildType === selectedType ? "#7fb069" : "#333";
    }
    roadButton.style.borderColor = roadsEnabled ? "#7fb069" : "#333";
    if (!selectedType && !roadsEnabled) callbacks.onBuildTypeSelected(null);
    else if (selectedType) callbacks.onBuildTypeSelected(selectedType);
  }

  const ui: Ui = {
    root,
    activeBuildType: () => selectedType,
    roadMode: () => roadsEnabled,
    showInspection(buildingId) {
      if (!buildingId) {
        inspection.element.style.display = "none";
        return;
      }
      inspection.element.style.display = "block";
      inspection.element.dataset.inspection = buildingId;
    },
    setStatus(message) {
      status.textContent = message;
    },
    updateStats(stats) {
      statsPanel.element.innerHTML = "";
      const rows: Array<[string, string]> = [
        ["Tick", String(stats.tick)],
        ["Population", `${stats.population} / ${stats.housingCapacity}`],
        ["Money", String(Math.floor(stats.resources.money))],
        ["Food", String(Math.floor(stats.resources.food))],
        ["Water", String(Math.floor(stats.resources.water))],
        ["Wood", String(Math.floor(stats.resources.wood))],
        ["Stone", String(Math.floor(stats.resources.stone))],
        ["Planks", String(Math.floor(stats.resources.planks))],
        ["Revenue/tick", String(stats.revenuePerTick)],
        ["  taxes", String(stats.taxesPerTick)],
        ["  commerce", String(stats.commercePerTick)],
        ["Maintenance/tick", String(stats.maintenancePerTick)],
        ["Net money/tick", String(stats.netMoneyPerTick)],
      ];
      for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        const labelSpan = document.createElement("span");
        labelSpan.textContent = label;
        const valueSpan = document.createElement("span");
        valueSpan.textContent = value;
        if (label === "Net money/tick") {
          valueSpan.style.color = stats.netMoneyPerTick >= 0 ? "#7fb069" : "#d96a4a";
        }
        row.append(labelSpan, valueSpan);
        statsPanel.element.appendChild(row);
      }
    },
  };

  // initial paint: palette state only; stats arrive with the first tick
  refreshPalette();

  return ui;
}

function panel(
  id: string,
  position: Partial<CSSStyleDeclaration>,
): { element: HTMLDivElement } {
  const element = document.createElement("div");
  element.id = id;
  Object.assign(element.style, {
    position: "absolute",
    pointerEvents: "auto",
    background: "rgba(11,14,20,0.85)",
    border: "1px solid #333",
    borderRadius: "6px",
    padding: "8px",
    ...position,
  } satisfies Partial<CSSStyleDeclaration>);
  return { element };
}

function styleButton(button: HTMLButtonElement): void {
  Object.assign(button.style, {
    background: "#161b26",
    color: "#d8dee9",
    border: "1px solid #333",
    borderRadius: "4px",
    padding: "4px 8px",
    cursor: "pointer",
  } satisfies Partial<CSSStyleDeclaration>);
}

function textButton(
  label: string,
  datasetKey: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.dataset.action = datasetKey;
  styleButton(button);
  button.addEventListener("click", onClick);
  return button;
}
