import type { GameState } from "../domain/simulation/state.js";
import { applyCommand } from "../domain/simulation/commands.js";
import { validatePlacement } from "../domain/building/placement.js";
import { allRoadCells } from "../domain/road/road.js";
import { cellKey } from "../domain/shared/cells.js";
import type { Renderer } from "../renderer/renderer.js";
import { getStaffingOverview } from "../application/queries/staffing.js";
import { BUILDING_DETAIL } from "./details.js";
import type { Ui } from "./ui.js";

/**
 * Player-intent input: pointer (hover / placement / road-drag /
 * inspection) + keyboard speeds. Owns road-drag state, `inspectAt`
 * and `describeCell`. Simulation rules live in domain; this module
 * only dispatches commands and reads derived state.
 */

export interface InputContext {
  root: HTMLElement;
  getState(): GameState;
  getRenderer(): Renderer;
  getUi(): Ui;
  refreshStats(): void;
  isPaused(): boolean;
  lastSpeedId(): string;
}

export function attachInput(ctx: InputContext): {
  inspectAt(x: number, y: number): void;
  dispose(): void;
} {
  let roadPath: string[] = [];
  let roadDragging = false;

  function rendererCanvas(): HTMLCanvasElement | null {
    return ctx.root.querySelector("canvas");
  }

  /** Hover tooltip text for a cell in inspect mode (states, not instructions). */
  function describeCell(x: number, y: number): string | null {
    const state = ctx.getState();
    for (const building of Object.values(state.buildings)) {
      if (building.x === x && building.y === y) {
        const flags = [
          building.status,
          building.staffed ? "staffed" : null,
          building.active ? null : "mothballed",
        ].filter(Boolean);
        return `${building.type} · ${flags.join(" · ")}`;
      }
    }
    const key = cellKey(x, y);
    const wood = state.woodDeposits[key];
    if (wood && wood.remaining > 0) return `Wood deposit · ${wood.remaining}`;
    const stone = state.stoneDeposits[key];
    if (stone && stone.remaining > 0) return `Stone deposit · ${stone.remaining}`;
    if (allRoadCells(state.roads).has(key)) return "Road";
    return null;
  }

  function inspectAt(x: number, y: number): void {
    const state = ctx.getState();
    const ui = ctx.getUi();
    for (const building of Object.values(state.buildings)) {
      if (building.x === x && building.y === y) {
        ui.setStatus(`${building.id}: ${building.type} · ${building.status}`);
        // staffing line for workplaces: rank in the fixed assignment order
        // and its state (staffed / idle / mothballed / no road / building)
        const staffing = getStaffingOverview(state).entries.find((e) => e.id === building.id);
        ui.showInspection({
          kind: "building",
          id: building.id,
          label: `${building.id} — ${building.type} · ${building.status}${building.active ? "" : " · mothballed"}`,
          detail: BUILDING_DETAIL[building.type],
          active: building.active,
          staffing: staffing?.staffingLine,
        });
        return;
      }
    }
    const key = cellKey(x, y);
    if (allRoadCells(state.roads).has(key)) {
      ui.setStatus(`Road at ${key}`);
      ui.showInspection({ kind: "road", cell: key, label: `Road @ ${key}` });
      return;
    }
    ui.showInspection(null);
  }

  // keyboard: Space = pause/play toggle, 1/2/4/8 = speeds (drives the same
  // buttons as the UI so the highlight stays in sync)
  function clickSpeed(id: string): void {
    ctx.root
      .querySelector<HTMLButtonElement>(`button[data-action='speed-${id}']`)
      ?.click();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (event.code === "Space") {
      event.preventDefault();
      clickSpeed(ctx.isPaused() ? ctx.lastSpeedId() : "pause");
      return;
    }
    if (["1", "2", "4", "8"].includes(event.key)) clickSpeed(`${event.key}x`);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.target !== rendererCanvas()) return;
    const state = ctx.getState();
    const renderer = ctx.getRenderer();
    const ui = ctx.getUi();
    const cell = renderer.pickCell(event.clientX, event.clientY);
    if (!cell) {
      renderer.setHover(null, false);
      return;
    }
    if (roadDragging) {
      const key = cellKey(cell.x, cell.y);
      if (!roadPath.includes(key)) roadPath.push(key);
      renderer.setHover(cell, true);
      ui.showTooltip(null);
      return;
    }
    const buildType = ui.activeBuildType();
    if (!buildType && !ui.roadMode()) {
      renderer.setHover(null, false);
      ui.showTooltip(describeCell(cell.x, cell.y), event.clientX, event.clientY);
      return;
    }
    ui.showTooltip(null);
    const validation = validatePlacement(state, buildType ?? "residence", cell.x, cell.y);
    renderer.setHover(cell, validation.ok);
    ui.setStatus(validation.ok ? "" : `Cannot place here: ${validation.reason}`);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.target !== rendererCanvas()) return;
    const state = ctx.getState();
    const renderer = ctx.getRenderer();
    const ui = ctx.getUi();
    const cell = renderer.pickCell(event.clientX, event.clientY);
    if (!cell) return;

    if (ui.roadMode()) {
      roadDragging = true;
      roadPath = [cellKey(cell.x, cell.y)];
      renderer.setHover(cell, true);
      return;
    }

    const buildType = ui.activeBuildType();
    if (!buildType) {
      inspectAt(cell.x, cell.y);
      return;
    }
    const result = applyCommand(state, { kind: "placeBuilding", type: buildType, x: cell.x, y: cell.y });
    ui.setStatus(result.ok ? "" : `Cannot place: ${result.reason}`);
    renderer.update(state);
    ctx.refreshStats();
  }

  function onPointerUp(): void {
    if (!roadDragging) return;
    roadDragging = false;
    if (roadPath.length > 0) {
      const state = ctx.getState();
      const result = applyCommand(state, { kind: "placeRoads", cells: roadPath });
      ctx.getUi().setStatus(result.ok ? "" : `Road rejected: ${result.reason}`);
    }
    roadPath = [];
    ctx.getRenderer().update(ctx.getState());
    ctx.refreshStats();
  }

  function onClick(event: MouseEvent): void {
    if (event.target !== rendererCanvas()) return;
    const ui = ctx.getUi();
    if (ui.activeBuildType() || ui.roadMode()) return;
    const cell = ctx.getRenderer().pickCell(event.clientX, event.clientY);
    if (cell) inspectAt(cell.x, cell.y);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointerup", onPointerUp);
  ctx.root.addEventListener("pointermove", onPointerMove as EventListener);
  ctx.root.addEventListener("pointerdown", onPointerDown as EventListener);
  ctx.root.addEventListener("click", onClick as EventListener);

  return {
    inspectAt,
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerup", onPointerUp);
      ctx.root.removeEventListener("pointermove", onPointerMove as EventListener);
      ctx.root.removeEventListener("pointerdown", onPointerDown as EventListener);
      ctx.root.removeEventListener("click", onClick as EventListener);
    },
  };
}
