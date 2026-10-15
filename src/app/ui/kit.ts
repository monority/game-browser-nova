import type { BuildingType } from "../../content/buildings.js";

/**
 * UI kit: element factories for the panel components (Step031).
 * Visuals live in src/styles/nova.css — factories only set semantic
 * classes and data attributes; JS never paints styles here.
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

/** Base palette order; market unlocks at Age 2 via setAgeLocked. */
export const PALETTE_TYPES: BuildingType[] = [
  "residence",
  "farm",
  "well",
  "workshop",
  "lumberCamp",
  "quarry",
  "park",
  "market",
];

/** Themed absolutely positioned panel; position/layout rules live in CSS (#stats etc.). */
export function panel(id: string): { element: HTMLDivElement } {
  const element = document.createElement("div");
  element.id = id;
  element.className = "nova-panel";
  return { element };
}

/** Themed action button with a stable `data-action` selector key. */
export function textButton(
  label: string,
  datasetKey: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.dataset.action = datasetKey;
  button.className = "nova-btn";
  button.addEventListener("click", onClick);
  return button;
}

/** Muted explanatory line (states only, never instructions). */
export function staticNote(text: string, extraClass?: string): HTMLDivElement {
  const note = document.createElement("div");
  note.textContent = text;
  note.className = extraClass ? `nova-note ${extraClass}` : "nova-note";
  return note;
}

/** Uppercase section header; `loose` uses the 8px top margin variant. */
export function sectionHeader(text: string, loose = false): HTMLDivElement {
  const header = document.createElement("div");
  header.textContent = text;
  header.className = loose ? "nova-section nova-section--loose" : "nova-section";
  return header;
}

/** Two-column label/value row; `valueClass` colors the value (ok/warn/danger). */
export function statRow(label: string, value: string, valueClass?: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "nova-row nova-row--between";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  const valueSpan = document.createElement("span");
  valueSpan.textContent = value;
  if (valueClass) valueSpan.className = valueClass;
  row.append(labelSpan, valueSpan);
  return row;
}

/** Row-shaped div with layout classes (gap/margin variants). */
export function row(extraClasses: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = `nova-row ${extraClasses}`.trim();
  return div;
}
