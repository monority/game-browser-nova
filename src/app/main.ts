import { createInitialState, type GameState } from "../domain/simulation/state.js";
import { stepSimulation } from "../domain/simulation/tick.js";
import { applyCommand } from "../domain/simulation/commands.js";
import { validatePlacement } from "../domain/building/placement.js";
import { allRoadCells } from "../domain/road/road.js";
import { cellKey } from "../domain/shared/cells.js";
import { createRenderer, type Renderer } from "../renderer/renderer.js";
import { getColonyStats } from "../application/queries/stats.js";
import { getResourceSummaries, getAlerts, getResourceContributors } from "../application/queries/analysis.js";
import { getStaffingOverview } from "../application/queries/staffing.js";
import { evaluateMilestones, canAdvanceAge, hasTech } from "../domain/progression/progression.js";
import { TECH_DEFINITIONS } from "../content/techs.js";
import { BUILDING_DEFINITIONS, type BuildingType } from "../content/buildings.js";
import { AGE_NAMES } from "../content/progression.js";
import { BUILDING_DETAIL } from "./details.js";
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
  let ticksPerSecond = 2; // 1x
  let paused = false;
  let lastSpeedId = "1x";

  // --- UI ------------------------------------------------------------------
  const ui = createUi(root, {
    onSpeedChanged: (tps, id) => {
      paused = tps === 0;
      if (!paused) {
        ticksPerSecond = tps;
        lastSpeedId = id;
      }
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
    onOverlayChanged: (mode) => {
      renderer.setOverlay(mode);
      ui.setStatus(mode === "none" ? "" : `Overlay: ${mode}`);
    },
    onForecastRowClick: (resource) => {
      ui.showDrillDown(getResourceContributors(state, resource));
    },
    onResearchTech: (techId) => {
      const result = applyCommand(state, { kind: "researchTech", techId });
      ui.setStatus(result.ok ? `Researched ${techId}.` : `Cannot research: ${result.reason}`);
      refreshStats();
      renderer.update(state);
    },
    onAdvanceAge: () => {
      const result = applyCommand(state, { kind: "advanceAge" });
      ui.setStatus(result.ok ? `Welcome to ${AGE_NAMES[state.age] ?? "Age " + state.age}.` : `Cannot advance: ${result.reason}`);
      renderer.update(state);
      refreshStats();
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

  // keyboard: Space = pause/play toggle, 1/2/4/8 = speeds (drives the same
  // buttons as the UI so the highlight stays in sync)
  function clickSpeed(id: string): void {
    root
      .querySelector<HTMLButtonElement>(`button[data-action='speed-${id}']`)
      ?.click();
  }
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (paused) clickSpeed(lastSpeedId);
      else clickSpeed("pause");
      return;
    }
    if (["1", "2", "4", "8"].includes(event.key)) clickSpeed(`${event.key}x`);
  });

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
  });

  /** Hover tooltip text for a cell in inspect mode (states, not instructions). */
  function describeCell(x: number, y: number): string | null {
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

  // Palette unlocks follow building ages (Phase 9: Market appears in Age 2).
  const BUILD_ORDER: BuildingType[] = [
    "residence",
    "farm",
    "well",
    "workshop",
    "lumberCamp",
    "quarry",
    "park",
    "market",
  ];

  function refreshStats(): void {
    ui.updateStats(getColonyStats(state));
    ui.setAvailableBuildings(
      BUILD_ORDER.filter((t) => (BUILDING_DEFINITIONS[t].requiredAge ?? 1) <= state.age),
    );
    ui.setAgeLocked(
      BUILD_ORDER.filter((t) => (BUILDING_DEFINITIONS[t].requiredAge ?? 1) > state.age),
    );
    ui.updateForecast(Object.values(getResourceSummaries(state)));
    ui.setAlerts(getAlerts(state));
    const milestones = evaluateMilestones(state, state.age);
    ui.updateProgression({
      age: state.age,
      ageName: AGE_NAMES[state.age] ?? `Age ${state.age}`,
      milestones,
      canAdvance: canAdvanceAge(state),
      availableTechs: Object.values(TECH_DEFINITIONS)
        .filter((t) => t.age <= state.age && !hasTech(state, t.id))
        .map((t) => ({ id: t.id, displayName: t.displayName, cost: t.cost })),
      researchedTechs: [...state.researchedTechs],
    });
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
    milestones: () => evaluateMilestones(state, state.age),
    canAdvanceAge: () => canAdvanceAge(state),
    perf: () => renderer.perfStats(),
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
