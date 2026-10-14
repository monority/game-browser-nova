import type { BuildingType } from "../../content/buildings.js";
import { BUILDING_DEFINITIONS } from "../../content/buildings.js";
import type { OverlayMode } from "../../renderer/overlay.js";
import { PALETTE_TYPES, SPEED_SETTINGS, panel, styleButton, textButton, TOKENS } from "./kit.js";

/**
 * Controls panel (Step029 split): the bottom bar — build palette with
 * age locks, road mode, save/load, overlay toggles, time controls.
 * Owns the placement selection state (selectedType / roadsEnabled).
 */

export interface ControlsPanel {
  element: HTMLDivElement;
  activeBuildType(): BuildingType | null;
  roadMode(): boolean;
  setAvailableBuildings(types: BuildingType[]): void;
  /** Buildings shown in the palette but locked behind a later age. */
  setAgeLocked(types: BuildingType[]): void;
}

/** Overlay legend tooltips (states only). */
const OVERLAY_LEGENDS: Record<OverlayMode, string> = {
  none: "No overlay tinting",
  staffing: "Staffing: green staffed · amber idle (no workers) · gray mothballed",
  deposits: "Deposits: markers show remaining wood/stone",
};

/** Button label without the age suffix (base palette labels). */
function paletteLabel(type: BuildingType): string {
  const definition = BUILDING_DEFINITIONS[type];
  return `${definition.displayName} (${definition.moneyCost}$${definition.plankCost > 0 ? ` +${definition.plankCost}pl` : ""})`;
}

export function createControlsPanel(callbacks: {
  onBuildTypeSelected(type: BuildingType | null): void;
  onRoadModeToggled(enabled: boolean): void;
  onSpeedChanged(ticksPerSecond: number, id: string): void;
  onSave(): void;
  onLoad(): void;
  onOverlayChanged(mode: OverlayMode): void;
}): ControlsPanel {
  let selectedType: BuildingType | null = null;
  let roadsEnabled = false;
  let availableTypes: BuildingType[] = [...PALETTE_TYPES];
  let ageLockedTypes: BuildingType[] = [];

  const { element } = panel("controls", { bottom: "12px", left: "12px", right: "12px" });

  const paletteRow = document.createElement("div");
  paletteRow.style.display = "flex";
  paletteRow.style.gap = "6px";
  for (const type of PALETTE_TYPES) {
    const button = document.createElement("button");
    button.dataset.buildType = type;
    button.textContent = paletteLabel(type);
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
    button.title = OVERLAY_LEGENDS[mode];
    overlayRow.appendChild(button);
  }

  element.append(controlsRow, paletteRow, overlayRow, speedRow);

  /** One place that reconciles available / age-locked / hidden palette state. */
  function applyPaletteVisibility(): void {
    for (const child of paletteRow.children) {
      const button = child as HTMLButtonElement;
      const type = button.dataset.buildType as BuildingType;
      if (ageLockedTypes.includes(type)) {
        const requiredAge = BUILDING_DEFINITIONS[type].requiredAge ?? 1;
        button.textContent = `${paletteLabel(type)} — requires Age ${requiredAge}`;
        button.disabled = true;
        button.title = `Unlocks in Age ${requiredAge}`;
        button.style.display = "";
        button.style.opacity = "0.45";
        button.style.cursor = "not-allowed";
      } else if (availableTypes.includes(type)) {
        button.textContent = paletteLabel(type);
        button.disabled = false;
        button.title = "";
        button.style.display = "";
        button.style.opacity = "";
        button.style.cursor = "pointer";
      } else {
        button.style.display = "none";
      }
    }
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

  function setRoads(enabled: boolean): void {
    roadsEnabled = enabled;
    if (enabled) selectedType = null;
    callbacks.onRoadModeToggled(enabled);
  }

  function setAvailableBuildings(types: BuildingType[]): void {
    availableTypes = [...types];
    if (selectedType && !availableTypes.includes(selectedType)) selectedType = null;
    applyPaletteVisibility();
    refreshPalette();
  }

  function setAgeLocked(types: BuildingType[]): void {
    ageLockedTypes = [...types];
    applyPaletteVisibility();
    refreshPalette();
  }

  // initial paint: palette borders; createUi's caller (boot) runs a
  // refreshStats() right after creation which applies age locks
  refreshPalette();

  return {
    element,
    activeBuildType: () => selectedType,
    roadMode: () => roadsEnabled,
    setAvailableBuildings,
    setAgeLocked,
  };
}
