import { createInitialState, type GameState } from "../domain/simulation/state.js";
import { stepSimulation } from "../domain/simulation/tick.js";
import { applyCommand } from "../domain/simulation/commands.js";
import { validatePlacement } from "../domain/building/placement.js";
import { allRoadCells } from "../domain/road/road.js";
import { cellKey } from "../domain/shared/cells.js";
import { createRenderer, type Renderer } from "../renderer/renderer.js";
import { getColonyStats } from "../application/queries/stats.js";
import { createUi } from "./ui.js";
import {
  parseSaveString,
  saveToString,
  SaveValidationError,
} from "../application/persistence/save.js";

/**
 * NOVA browser entry: owns the fixed-timestep loop, DOM bootstrap and
 * player-intent dispatch only. Simulation rules live in the domain;
 * rendering and UI are presentation (ADR-001, ADR-002).
 */

const BASE_TICK_MS = 500; // 1x speed — fixed simulation tick
const SAVE_STORAGE_KEY = "nova-save";

const DEFAULT_CONFIG = {
  seed: "nova-default",
  width: 24,
  height: 24,
  woodDeposits: [
    { x: 4, y: 4, amount: 60 },
    { x: 18, y: 6, amount: 40 },
  ],
  stoneDeposits: [{ x: 7, y: 18, amount: 50 }],
};

export function boot(root: HTMLElement): { stop(): void } {
  let state: GameState = createInitialState(DEFAULT_CONFIG);
  let renderer: Renderer = createRenderer(root, state);
  const ticksPerSecond = 2; // 1x
  let paused = false;

  // --- UI ------------------------------------------------------------------
  const ui = createUi(root, {
    onSpeedChanged: (tps) => {
      paused = tps === 0;
    },
    onSave: () => {
      try {
        localStorage.setItem(SAVE_STORAGE_KEY, saveToString(state));
        ui.setStatus("Colony saved.");
      } catch (error) {
        ui.setStatus(`Save failed: ${String(error)}`);
      }
    },
    onLoad: () => {
      const text = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!text) {
        ui.setStatus("No saved colony found.");
        return;
      }
      try {
        const loaded = parseSaveString(text);
        swapState(loaded);
        ui.setStatus("Colony loaded.");
      } catch (error) {
        ui.setStatus(
          error instanceof SaveValidationError
            ? `Load rejected: ${error.message}`
            : `Load failed: ${String(error)}`,
        );
      }
    },
    onBuildTypeSelected: () => {
      /* selection state lives in the UI; hover/click read it each event */
    },
    onRoadModeToggled: () => {
      /* same */
    },
    onRemoveBuilding: (id) => {
      const result = applyCommand(state, { kind: "removeBuilding", id });
      ui.setStatus(result.ok ? "Removed." : `Cannot remove: ${result.reason}`);
      renderer.update(state);
      refreshStats();
    },
    onRemoveRoadCell: (cell) => {
      const result = applyCommand(state, { kind: "removeRoads", cells: [cell] });
      ui.setStatus(result.ok ? "Road cell removed." : `Cannot remove road: ${result.reason}`);
      renderer.update(state);
      refreshStats();
    },
    onSetBuildingActive: (id, active) => {
      const result = applyCommand(state, { kind: "setBuildingActive", id, active });
      ui.setStatus(
        result.ok ? (active ? "Reactivated — takes effect next tick." : "Mothballed — maintenance relief next tick.") : `Cannot change state: ${result.reason}`,
      );
      renderer.update(state);
      refreshStats();
      // re-render the inspection panel so the Mothball/Reactivate button flips
      const building = state.buildings[id];
      if (building) inspectAt(building.x, building.y);
      else ui.showInspection(null);
    },
  });

  function swapState(next: GameState): void {
    state = next;
    renderer.dispose();
    renderer = createRenderer(root, state);
  }

  // --- interaction -----------------------------------------------------------
  let roadPath: string[] = [];
  let roadDragging = false;

  root.addEventListener("pointermove", (event) => {
    if (event.target !== rendererCanvas()) return;
    const cell = renderer.pickCell(event.clientX, event.clientY);
    if (!cell) {
      renderer.setHover(null, false);
      return;
    }
    if (roadDragging) {
      const key = cellKey(cell.x, cell.y);
      if (!roadPath.includes(key)) roadPath.push(key);
      renderer.setHover(cell, true);
      return;
    }
    const buildType = ui.activeBuildType();
    if (!buildType && !ui.roadMode()) {
      renderer.setHover(null, false);
      return;
    }
    const validation = validatePlacement(state, buildType ?? "residence", cell.x, cell.y);
    renderer.setHover(cell, validation.ok);
    ui.setStatus(validation.ok ? "" : `Cannot place here: ${validation.reason}`);
  });

  root.addEventListener("pointerdown", (event) => {
    if (event.target !== rendererCanvas()) return;
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
    refreshStats();
  });

  window.addEventListener("pointerup", () => {
    if (!roadDragging) return;
    roadDragging = false;
    if (roadPath.length > 0) {
      const result = applyCommand(state, { kind: "placeRoads", cells: roadPath });
      ui.setStatus(result.ok ? "" : `Road rejected: ${result.reason}`);
    }
    roadPath = [];
    renderer.update(state);
    refreshStats();
  });

  root.addEventListener("click", (event) => {
    if (event.target !== rendererCanvas()) return;
    if (ui.activeBuildType() || ui.roadMode()) return;
    const cell = renderer.pickCell(event.clientX, event.clientY);
    if (cell) inspectAt(cell.x, cell.y);
  });

  function rendererCanvas(): HTMLCanvasElement | null {
    return root.querySelector("canvas");
  }

  function inspectAt(x: number, y: number): void {
    for (const building of Object.values(state.buildings)) {
      if (building.x === x && building.y === y) {
        ui.setStatus(`${building.id}: ${building.type} · ${building.status}`);
        ui.showInspection({
          kind: "building",
          id: building.id,
          label: `${building.id} — ${building.type} · ${building.status}${building.active ? "" : " · mothballed"}`,
          active: building.active,
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

  function refreshStats(): void {
    ui.updateStats(getColonyStats(state));
  }

  // --- fixed-timestep loop (ADR-002) -----------------------------------------
  let last = performance.now();
  let accumulator = 0;
  let frameHandle = 0;

  function frame(now: number): void {
    accumulator += now - last;
    last = now;
    // cap backlog so pause/suspension never fast-forwards on resume
    accumulator = Math.min(accumulator, 1000);
    const tickMs = paused ? Infinity : BASE_TICK_MS / ticksPerSecond;
    while (accumulator >= tickMs) {
      stepSimulation(state);
      accumulator -= tickMs;
      renderer.update(state);
      refreshStats();
    }
    frameHandle = requestAnimationFrame(frame);
  }
  frameHandle = requestAnimationFrame(frame);

  // --- diagnostics surface (docs/DEBUGGING.md §3) ------------------------------
  const nova = window as typeof window & { __nova?: unknown };
  nova.__nova = {
    getState: () => state,
    stats: () => getColonyStats(state),
    command: (command: unknown) =>
      applyCommand(state, command as Parameters<typeof applyCommand>[1]),
  };

  return {
    stop: () => {
      cancelAnimationFrame(frameHandle);
      renderer.dispose();
      ui.root.remove();
    },
  };
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("NOVA: #app root element not found");
boot(root);
