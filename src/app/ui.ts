import type { BuildingType } from "../content/buildings.js";
import { BUILDING_DEFINITIONS } from "../content/buildings.js";
import type { ColonyStats } from "../application/queries/stats.js";
import type { ResourceContributors, ResourceForecast, Alert, SurvivalResource } from "../application/queries/analysis.js";
import type { MilestoneStatus } from "../domain/progression/progression.js";
import type { OverlayMode } from "../renderer/overlay.js";

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
  "park",
  "market",
];

/** UI color tokens (docs/game/10-VISUAL-DIRECTION.md: dark but colorful). */
const TOKENS = {
  bg: "rgba(11,14,20,0.88)",
  border: "#2c3442",
  borderActive: "#7fb069",
  borderInfo: "#5bc0eb",
  text: "#d8dee9",
  muted: "#8a93a3",
  ok: "#7fb069",
  warn: "#d9a44a",
  danger: "#d96a4a",
  buttonBg: "#161b26",
} as const;

export interface Ui {
  root: HTMLDivElement;
  updateStats(stats: ColonyStats): void;
  updateProgression(info: {
    age: number;
    ageName: string;
    milestones: MilestoneStatus[];
    canAdvance: boolean;
    availableTechs: Array<{ id: string; displayName: string; cost: number }>;
    researchedTechs: string[];
  }): void;
  updateForecast(forecasts: ResourceForecast[]): void;
  setAlerts(alerts: Alert[]): void;
  setStatus(message: string): void;
  showTooltip(text: string | null, clientX?: number, clientY?: number): void;
  showDrillDown(info: ResourceContributors | null): void;
  showInspection(info: InspectionInfo): void;
  activeBuildType(): BuildingType | null;
  roadMode(): boolean;
  setAvailableBuildings(types: BuildingType[]): void;
}

export interface RemoveBuildingInfo {
  kind: "building";
  id: string;
  label: string;
  detail?: string;
  active: boolean;
}

export interface RemoveRoadInfo {
  kind: "road";
  cell: string;
  label: string;
}

export type InspectionInfo = RemoveBuildingInfo | RemoveRoadInfo | null;

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

  // --- stats + forecast + alerts panel (single left column) ----------------
  const statsPanel = panel("stats", {
    top: "12px",
    left: "12px",
    width: "210px",
    maxHeight: "60vh",
    overflowY: "auto",
  });
  root.appendChild(statsPanel.element);
  const forecastHeader = document.createElement("div");
  forecastHeader.textContent = "Forecast";
  forecastHeader.style.cssText =
    "margin:8px 0 2px;color:" + TOKENS.muted + ";font-size:11px;text-transform:uppercase;letter-spacing:0.08em";
  const alertsBlock = document.createElement("div");
  alertsBlock.style.cssText = "margin-top:8px;display:flex;flex-direction:column;gap:2px";

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
      callbacks.onSpeedChanged(setting.ticksPerSecond, setting.id);
      for (const child of speedRow.children) {
        (child as HTMLElement).style.borderColor = TOKENS.border;
      }
      button.style.borderColor = TOKENS.borderActive;
    });
    speedRow.appendChild(button);
  }

  const controlsRow = document.createElement("div");
  controlsRow.style.display = "flex";
  controlsRow.style.gap = "6px";
  controlsRow.style.flexWrap = "wrap";
  controlsRow.append(roadButton, saveButton, loadButton);

  // --- overlay toggle group --------------------------------------------------
  const overlayRow = document.createElement("div");
  overlayRow.style.cssText = "display:flex;gap:6px;margin-top:6px";
  const overlayModes: Array<[OverlayMode, string]> = [
    ["none", "No overlay"],
    ["staffing", "Staffing"],
    ["deposits", "Deposits"],
  ];
  for (const [mode, label] of overlayModes) {
    const button = textButton(label, `overlay-${mode}`, () => {
      callbacks.onOverlayChanged(mode);
      for (const child of overlayRow.children) {
        (child as HTMLElement).style.borderColor = TOKENS.border;
      }
      button.style.borderColor = TOKENS.borderInfo;
    });
    overlayRow.appendChild(button);
  }

  controls.element.append(controlsRow, paletteRow, overlayRow, speedRow);

  // --- inspection ----------------------------------------------------------
  const inspection = panel("inspection", { top: "12px", right: "12px", width: "220px" });
  inspection.element.style.display = "none";
  root.appendChild(inspection.element);
  const inspectionLabel = document.createElement("div");
  inspectionLabel.style.marginBottom = "6px";
  const deactivateButton = textButton("Mothball", "deactivate-building", () => {
    const info = currentInspection;
    if (info && info.kind === "building") callbacks.onSetBuildingActive(info.id, false);
  });
  const reactivateButton = textButton("Reactivate", "reactivate-building", () => {
    const info = currentInspection;
    if (info && info.kind === "building") callbacks.onSetBuildingActive(info.id, true);
  });
  const removeBuildingButton = textButton("Remove", "remove-building", () => {
    const info = currentInspection;
    if (info && info.kind === "building") callbacks.onRemoveBuilding(info.id);
    ui.showInspection(null);
  });
  const removeRoadButton = textButton("Remove road cell", "remove-road", () => {
    const info = currentInspection;
    if (info && info.kind === "road") callbacks.onRemoveRoadCell(info.cell);
    ui.showInspection(null);
  });
  let currentInspection: InspectionInfo = null;

  // --- progression panel (age, milestones, research) ------------------------
  const progressionPanel = panel("progression", { bottom: "110px", right: "12px", width: "240px" });
  root.appendChild(progressionPanel.element);

  // --- status line -------------------------------------------------------------
  const status = document.createElement("div");
  Object.assign(status.style, {
    position: "absolute",
    bottom: "96px",
    left: "12px",
    pointerEvents: "none",
    padding: "4px 8px",
    background: TOKENS.bg,
    borderRadius: "4px",
    minHeight: "18px",
  } satisfies Partial<CSSStyleDeclaration>);
  root.appendChild(status);

  // --- hover tooltip -----------------------------------------------------------
  const tooltip = document.createElement("div");
  Object.assign(tooltip.style, {
    position: "absolute",
    display: "none",
    pointerEvents: "none",
    padding: "3px 7px",
    background: "rgba(11,14,20,0.92)",
    border: "1px solid " + TOKENS.border,
    borderRadius: "4px",
    fontSize: "12px",
    whiteSpace: "nowrap",
    zIndex: "5",
  } satisfies Partial<CSSStyleDeclaration>);
  root.appendChild(tooltip);

  let availableTypes: BuildingType[] = [...PALETTE_TYPES];

  function setAvailableBuildings(types: BuildingType[]): void {
    availableTypes = [...types];
    if (selectedType && !availableTypes.includes(selectedType)) selectedType = null;
    for (const child of paletteRow.children) {
      const button = child as HTMLElement;
      button.style.display = availableTypes.includes(button.dataset.buildType as BuildingType) ? "" : "none";
    }
    refreshPalette();
  }

  function setRoads(enabled: boolean): void {
    roadsEnabled = enabled;
    if (enabled) selectedType = null;
    callbacks.onRoadModeToggled(enabled);
  }

  function refreshPalette(): void {
    for (const child of paletteRow.children) {
      const button = child as HTMLElement;
      button.style.borderColor =
        button.dataset.buildType === selectedType ? TOKENS.borderActive : TOKENS.border;
    }
    roadButton.style.borderColor = roadsEnabled ? TOKENS.borderActive : TOKENS.border;
    if (!selectedType && !roadsEnabled) callbacks.onBuildTypeSelected(null);
    else if (selectedType) callbacks.onBuildTypeSelected(selectedType);
  }

  const ui: Ui = {
    root,
    activeBuildType: () => selectedType,
    roadMode: () => roadsEnabled,
    setAvailableBuildings,
    updateProgression(info) {
      progressionPanel.element.innerHTML = "";
      const header = document.createElement("div");
      header.textContent = `${info.ageName} (Age ${info.age})`;
      header.style.cssText = "font-weight:600;margin-bottom:6px";
      progressionPanel.element.appendChild(header);

      const msHeader = document.createElement("div");
      msHeader.textContent = "Milestones";
      msHeader.style.cssText = "color:" + TOKENS.muted + ";font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin:6px 0 2px";
      progressionPanel.element.appendChild(msHeader);
      for (const milestone of info.milestones) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between";
        const label = document.createElement("span");
        label.textContent = milestone.label;
        const value = document.createElement("span");
        value.textContent = milestone.done ? "✓" : `${Math.min(milestone.value, milestone.threshold)}/${milestone.threshold}`;
        value.style.color = milestone.done ? TOKENS.ok : TOKENS.text;
        row.append(label, value);
        progressionPanel.element.appendChild(row);
      }

      const researchHeader = document.createElement("div");
      researchHeader.textContent = "Research";
      researchHeader.style.cssText = "color:" + TOKENS.muted + ";font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin:8px 0 2px";
      progressionPanel.element.appendChild(researchHeader);
      const researched = document.createElement("div");
      researched.textContent = info.researchedTechs.length > 0
        ? "Researched: " + info.researchedTechs.map((id) => {
            const names: Record<string, string> = { cropRotation: "Crop Rotation", masonry: "Masonry", tradeRoutes: "Trade Routes", irrigation: "Irrigation", deepMining: "Deep Mining" };
            return names[id] ?? id;
          }).join(", ")
        : "Researched: none";
      researched.style.cssText = "color:" + TOKENS.muted + ";margin-bottom:4px";
      progressionPanel.element.appendChild(researched);
      for (const tech of info.availableTechs) {
        const button = textButton(`${tech.displayName} (${tech.cost}$)`, `research-${tech.id}`, () => {
          callbacks.onResearchTech(tech.id);
        });
        progressionPanel.element.appendChild(button);
      }

      if (info.canAdvance) {
        const advance = textButton(`Advance to Age ${info.age + 1}`, "advance-age", () => {
          callbacks.onAdvanceAge();
        });
        advance.style.borderColor = TOKENS.borderActive;
        progressionPanel.element.appendChild(advance);
      }
    },

    updateForecast(forecasts: ResourceForecast[]) {
      // remove previous forecast + alert sections, re-append fresh
      statsPanel.element
        .querySelectorAll("[data-section='forecast'], [data-section='alerts']")
        .forEach((n) => n.remove());
      const section = document.createElement("div");
      section.dataset.section = "forecast";
      section.appendChild(forecastHeader);
      for (const f of forecasts) {
        const name = f.resource.charAt(0).toUpperCase() + f.resource.slice(1);
        const remaining = f.ticksRemaining !== null ? ` → ${f.ticksRemaining} ticks` : "";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between;cursor:pointer";
        row.title = "Click: show contributing buildings";
        row.dataset.resource = f.resource;
        const label = document.createElement("span");
        label.textContent = `${name} ${f.productionPerTick}/${f.consumptionPerTick}`;
        const value = document.createElement("span");
        value.textContent = `${Math.floor(f.stock)}${remaining}`;
        value.style.color = f.balancePerTick < 0 ? TOKENS.danger : TOKENS.text;
        row.append(label, value);
        row.addEventListener("click", () => callbacks.onForecastRowClick(f.resource));
        section.appendChild(row);
      }
      statsPanel.element.appendChild(section);
    },

    setAlerts(alerts: Alert[]) {
      statsPanel.element
        .querySelectorAll("[data-section='alerts']")
        .forEach((n) => n.remove());
      if (alerts.length === 0) return;
      const section = document.createElement("div");
      section.dataset.section = "alerts";
      for (const alert of alerts) {
        const line = document.createElement("div");
        line.textContent = alert.message;
        line.style.color = alert.severity === "warning" ? TOKENS.warn : TOKENS.muted;
        section.appendChild(line);
      }
      statsPanel.element.appendChild(section);
    },

    showTooltip(text, clientX, clientY) {
      if (!text || clientX === undefined || clientY === undefined) {
        tooltip.style.display = "none";
        return;
      }
      tooltip.textContent = text;
      tooltip.style.left = `${clientX + 14}px`;
      tooltip.style.top = `${clientY + 14}px`;
      tooltip.style.display = "block";
    },

    showDrillDown(info) {
      // the right panel is shared between building inspection and analysis
      // drill-down — the latest selection wins
      inspection.element.innerHTML = "";
      if (!info) {
        inspection.element.style.display = "none";
        return;
      }
      inspection.element.style.display = "block";
      inspection.element.dataset.drilldown = info.resource;
      const header = document.createElement("div");
      header.textContent = `${info.resource.charAt(0).toUpperCase() + info.resource.slice(1)} — contributors`;
      header.style.cssText = "margin-bottom:6px;font-weight:600";
      inspection.element.appendChild(header);
      const consumer = document.createElement("div");
      consumer.textContent = `Consumption: ${info.consumptionPerTick}/tick (population)`;
      consumer.style.cssText = "margin-bottom:6px;color:#8a93a3";
      inspection.element.appendChild(consumer);
      if (info.producers.length === 0) {
        inspection.element.appendChild(staticNote("No producing buildings."));
        return;
      }
      for (const p of info.producers) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between";
        const name = document.createElement("span");
        name.textContent = `${p.type} · ${p.id} @ ${p.x},${p.y}`;
        const stateSpan = document.createElement("span");
        const stateText = !p.active ? "mothballed" : p.staffed ? "staffed" : "idle";
        stateSpan.textContent = stateText;
        stateSpan.style.color = !p.active ? TOKENS.muted : p.staffed ? TOKENS.ok : TOKENS.warn;
        row.append(name, stateSpan);
        inspection.element.appendChild(row);
      }
    },

    showInspection(info) {
      currentInspection = info;
      inspection.element.innerHTML = "";
      if (!info) {
        inspection.element.style.display = "none";
        return;
      }
      inspection.element.style.display = "block";
      inspection.element.dataset.inspection = info.kind === "building" ? info.id : "road";
      delete inspection.element.dataset.drilldown;
      inspectionLabel.textContent = info.label;
      inspection.element.appendChild(inspectionLabel);
      if (info.kind === "building") {
        if (info.detail) {
          const detail = staticNote(info.detail);
          detail.style.marginBottom = "6px";
          inspection.element.appendChild(detail);
        }
        if (info.id === "colony-center") {
          inspection.element.appendChild(
            staticNote("The Colony Center anchor cannot be removed or mothballed."),
          );
        } else if (info.active) {
          inspection.element.appendChild(deactivateButton);
          inspection.element.appendChild(removeBuildingButton);
        } else {
          inspection.element.appendChild(reactivateButton);
          inspection.element.appendChild(removeBuildingButton);
        }
      } else {
        inspection.element.appendChild(removeRoadButton);
      }
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
        ["Pollution", String(Math.round(stats.pollution))],
        ["Env quality", String(Math.round(stats.envQuality))],
        ["Revenue/tick", String(stats.revenuePerTick)],
        ["  taxes", String(stats.taxesPerTick)],
        ["  commerce", String(stats.commercePerTick)],
        ["  market", String(stats.marketPerTick)],
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
          valueSpan.style.color = stats.netMoneyPerTick >= 0 ? TOKENS.ok : TOKENS.danger;
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
    background: TOKENS.bg,
    border: "1px solid " + TOKENS.border,
    borderRadius: "8px",
    padding: "10px",
    backdropFilter: "blur(6px)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
    ...position,
  } satisfies Partial<CSSStyleDeclaration>);
  return { element };
}

function styleButton(button: HTMLButtonElement): void {
  Object.assign(button.style, {
    background: TOKENS.buttonBg,
    color: TOKENS.text,
    border: "1px solid " + TOKENS.border,
    borderRadius: "5px",
    padding: "4px 9px",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
  } satisfies Partial<CSSStyleDeclaration>);
  button.addEventListener("mouseenter", () => {
    button.style.background = "#1e2534";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = TOKENS.buttonBg;
  });
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

function staticNote(text: string): HTMLDivElement {
  const note = document.createElement("div");
  note.textContent = text;
  note.style.color = "#8a93a3";
  return note;
}
