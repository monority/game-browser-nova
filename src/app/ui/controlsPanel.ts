import type { BuildingType } from "@/content/buildings.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";
import type { OverlayMode } from "@/renderer/overlay.js";
import { PALETTE_TYPES, SPEED_SETTINGS, panel, row, textButton } from "./kit.js";

/**
 * Controls panel: the bottom bar — build palette with age locks, road
 * mode, save/load, overlay toggles, time controls. Owns the placement
 * selection state (selectedType / roadsEnabled).
 *
 * State is expressed as data-attributes / native attrs (selected,
 * active, disabled, hidden); nova.css paints them.
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

/** Mark one button active in its row; clears the siblings' data-active. */
function setActive(container: HTMLElement, active: HTMLElement | null): void {
  for (const child of container.children) {
    if (child === active) continue;
    delete (child as HTMLElement).dataset.active;
  }
  if (active) active.dataset.active = "true";
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

  const { element } = panel("controls");

  const paletteRow = row("nova-row--gap");
  for (const type of PALETTE_TYPES) {
    const button = document.createElement("button");
    button.dataset.buildType = type;
    button.textContent = paletteLabel(type);
    button.className = "nova-btn";
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
  roadButton.className = "nova-btn";
  roadButton.addEventListener("click", () => {
    setRoads(!roadsEnabled);
    refreshPalette();
  });

  const saveButton = textButton("Save", "save", callbacks.onSave);
  const loadButton = textButton("Load", "load", callbacks.onLoad);

  const speedRow = row("nova-row--gap nova-row--mt");
  for (const setting of SPEED_SETTINGS) {
    const button = textButton(setting.id, `speed-${setting.id}`, () => {
      callbacks.onSpeedChanged(setting.ticksPerSecond, setting.id);
      setActive(speedRow, button);
    });
    button.classList.add("nova-speed-btn");
    speedRow.appendChild(button);
  }

  const controlsRow = row("nova-row--gap nova-row--wrap");
  controlsRow.append(roadButton, saveButton, loadButton);

  const overlayRow = row("nova-row--gap nova-row--mt");
  const overlayModes: Array<[OverlayMode, string]> = [
    ["none", "No overlay"],
    ["staffing", "Staffing"],
    ["deposits", "Deposits"],
  ];
  for (const [mode, label] of overlayModes) {
    const button = textButton(label, `overlay-${mode}`, () => {
      callbacks.onOverlayChanged(mode);
      setActive(overlayRow, button);
    });
    button.classList.add("nova-overlay-btn");
    button.title = OVERLAY_LEGENDS[mode];
    overlayRow.appendChild(button);
  }

  element.append(controlsRow, paletteRow, overlayRow, speedRow);

  /**
   * One place that reconciles palette state: native hidden/disabled
   * attributes plus data-locked; CSS paints the three states.
   */
  function applyPaletteVisibility(): void {
    for (const child of paletteRow.children) {
      const button = child as HTMLButtonElement;
      const type = button.dataset.buildType as BuildingType;
      if (ageLockedTypes.includes(type)) {
        const requiredAge = BUILDING_DEFINITIONS[type].requiredAge ?? 1;
        button.textContent = `${paletteLabel(type)} — requires Age ${requiredAge}`;
        button.title = `Unlocks in Age ${requiredAge}`;
        button.dataset.locked = "true";
        button.disabled = true;
        button.hidden = false;
      } else if (availableTypes.includes(type)) {
        button.textContent = paletteLabel(type);
        button.title = "";
        delete button.dataset.locked;
        button.disabled = false;
        button.hidden = false;
      } else {
        button.hidden = true;
        button.disabled = true;
      }
    }
  }

  function refreshPalette(): void {
    for (const child of paletteRow.children) {
      const button = child as HTMLElement;
      if (button.dataset.buildType === selectedType) button.dataset.selected = "true";
      else delete button.dataset.selected;
    }
    if (roadsEnabled) roadButton.dataset.active = "true";
    else delete roadButton.dataset.active;
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

  // initial paint: palette state; createUi's caller (boot) runs a
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
