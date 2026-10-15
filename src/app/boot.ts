import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { stepSimulation } from "@/domain/simulation/tick.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { createRenderer, type Renderer } from "@/renderer/renderer.js";
import { getColonyStats } from "@/application/queries/stats.js";
import { getResourceSummaries, getAlerts, getResourceContributors } from "@/application/queries/analysis.js";
import { evaluateMilestones, canAdvanceAge, hasTech } from "@/domain/progression/progression.js";
import { TECH_DEFINITIONS } from "@/content/techs.js";
import { BUILDING_DEFINITIONS } from "@/content/buildings.js";
import { AGE_NAMES } from "@/content/progression.js";
import { createUi, type Ui } from "./ui.js";
import { PALETTE_TYPES } from "./ui/kit.js";
import {
  parseSaveString,
  saveToString,
  SaveValidationError,
} from "@/application/persistence/save.js";
import { attachInput } from "./input.js";
import { startFixedTimestepLoop } from "./loop.js";
import { attachDiagnostics } from "./diagnostics.js";

/**
 * Boot composition root: owns state, renderer, UI callbacks,
 * refreshStats and the fixed-timestep loop. Simulation rules live
 * in domain; rendering and UI are presentation (ADR-001, ADR-002).
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

// Palette unlocks follow building ages (Phase 9: Market appears in Age 2);
// order comes from the single PALETTE_TYPES source in ui/kit.

export function boot(root: HTMLElement): { stop(): void } {
  let state: GameState = createInitialState(DEFAULT_CONFIG);
  let renderer: Renderer = createRenderer(root, state);
  let ui: Ui | null = null;
  let ticksPerSecond = 2; // 1x
  let paused = false;
  let lastSpeedId = "1x";

  function swapState(next: GameState): void {
    state = next;
    renderer.dispose();
    renderer = createRenderer(root, state);
  }

  function refreshStats(): void {
    if (!ui) return;
    ui.updateStats(getColonyStats(state));
    ui.setAvailableBuildings(
      PALETTE_TYPES.filter((t) => (BUILDING_DEFINITIONS[t].requiredAge ?? 1) <= state.age),
    );
    ui.setAgeLocked(
      PALETTE_TYPES.filter((t) => (BUILDING_DEFINITIONS[t].requiredAge ?? 1) > state.age),
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

  ui = createUi(root, {
    onSpeedChanged: (tps, id) => {
      paused = tps === 0;
      if (!paused) {
        ticksPerSecond = tps;
        lastSpeedId = id;
      }
    },
    onSave: () => {
      if (!ui) return;
      try {
        localStorage.setItem(SAVE_STORAGE_KEY, saveToString(state));
        ui.setStatus("Colony saved.");
      } catch (error) {
        ui.setStatus(`Save failed: ${String(error)}`);
      }
    },
    onLoad: () => {
      if (!ui) return;
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
      if (!ui) return;
      const result = applyCommand(state, { kind: "removeBuilding", id });
      ui.setStatus(result.ok ? "Removed." : `Cannot remove: ${result.reason}`);
      renderer.update(state);
      refreshStats();
    },
    onRemoveRoadCell: (cell) => {
      if (!ui) return;
      const result = applyCommand(state, { kind: "removeRoads", cells: [cell] });
      ui.setStatus(result.ok ? "Road cell removed." : `Cannot remove road: ${result.reason}`);
      renderer.update(state);
      refreshStats();
    },
    onSetBuildingActive: (id, active) => {
      if (!ui) return;
      const result = applyCommand(state, { kind: "setBuildingActive", id, active });
      ui.setStatus(
        result.ok ? (active ? "Reactivated — takes effect next tick." : "Mothballed — maintenance relief next tick.") : `Cannot change state: ${result.reason}`,
      );
      renderer.update(state);
      refreshStats();
      // re-render the inspection panel so the Mothball/Reactivate button flips
      const building = state.buildings[id];
      if (building) input.inspectAt(building.x, building.y);
      else ui.showInspection(null);
    },
    onOverlayChanged: (mode) => {
      if (!ui) return;
      renderer.setOverlay(mode);
      ui.setStatus(mode === "none" ? "" : `Overlay: ${mode}`);
    },
    onForecastRowClick: (resource) => {
      ui?.showDrillDown(getResourceContributors(state, resource));
    },
    onResearchTech: (techId) => {
      if (!ui) return;
      const result = applyCommand(state, { kind: "researchTech", techId });
      ui.setStatus(result.ok ? `Researched ${techId}.` : `Cannot research: ${result.reason}`);
      refreshStats();
      renderer.update(state);
    },
    onAdvanceAge: () => {
      if (!ui) return;
      const result = applyCommand(state, { kind: "advanceAge" });
      ui.setStatus(result.ok ? `Welcome to ${AGE_NAMES[state.age] ?? "Age " + state.age}.` : `Cannot advance: ${result.reason}`);
      renderer.update(state);
      refreshStats();
    },
  });

  const input = attachInput({
    root,
    getState: () => state,
    getRenderer: () => renderer,
    getUi: () => {
      if (!ui) throw new Error("NOVA: UI not ready");
      return ui;
    },
    refreshStats,
    isPaused: () => paused,
    lastSpeedId: () => lastSpeedId,
  });

  // fixed-timestep loop (ADR-002): one sim tick per step, render + stats refresh
  const loop = startFixedTimestepLoop(
    () => {
      stepSimulation(state);
      renderer.update(state);
      refreshStats();
    },
    () => (paused ? Infinity : BASE_TICK_MS / ticksPerSecond),
  );

  // Boot-time paint (Step028 corrective): palette age gates, stats and
  // progression must be correct from the first frame — without this, a
  // game booted (or paused) at tick 0 showed the raw palette state, e.g.
  // the Market enabled in Age 1 until the first tick refreshed the UI.
  refreshStats();

  attachDiagnostics({
    getState: () => state,
    stats: () => getColonyStats(state),
    command: (command: Parameters<typeof applyCommand>[1]) => applyCommand(state, command),
    milestones: () => evaluateMilestones(state, state.age),
    canAdvanceAge: () => canAdvanceAge(state),
    perf: () => renderer.perfStats(),
  });

  const uiRoot = ui.root;
  return {
    stop: () => {
      loop.stop();
      input.dispose();
      renderer.dispose();
      uiRoot.remove();
    },
  };
}
