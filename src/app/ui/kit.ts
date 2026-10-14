import type { BuildingType } from "../../content/buildings.js";

/**
 * UI kit: shared design tokens and DOM primitives for the panel
 * components (Step029 split). Presentation only, no simulation rules.
 */

/** UI color tokens (docs/game/10-VISUAL-DIRECTION.md: dark but colorful). */
export const TOKENS = {
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

/** An absolutely positioned themed panel container. */
export function panel(
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

export function styleButton(button: HTMLButtonElement): void {
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

/** Themed action button with a stable `data-action` selector key. */
export function textButton(
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

/** Muted explanatory line (states only, never instructions). */
export function staticNote(text: string): HTMLDivElement {
  const note = document.createElement("div");
  note.textContent = text;
  note.style.color = TOKENS.muted;
  return note;
}

/** Section header style shared by stats/progression panels. */
export function sectionHeader(text: string): HTMLDivElement {
  const header = document.createElement("div");
  header.textContent = text;
  header.style.cssText =
    "color:" +
    TOKENS.muted +
    ";font-size:11px;text-transform:uppercase;letter-spacing:0.08em";
  return header;
}

/** Two-column label/value row. */
export function statRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.justifyContent = "space-between";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  const valueSpan = document.createElement("span");
  valueSpan.textContent = value;
  row.append(labelSpan, valueSpan);
  return row;
}
