import type { GameState } from "@/domain/simulation/state.js";
import type { ColonyStats } from "@/application/queries/stats.js";
import type { MilestoneStatus } from "@/domain/progression/progression.js";
import type { PerfStats } from "@/renderer/renderer.js";
import type { applyCommand } from "@/domain/simulation/commands.js";

/**
 * Diagnostics surface (docs/DEBUGGING.md §3): the stable `__nova`
 * contract used by E2E and manual debugging. Declared here so the
 * `Window` typing is global — E2E keeps its own helper typing and
 * stays unmodified (S2 parity rule).
 */

export interface NovaHandle {
  getState(): GameState;
  stats(): ColonyStats;
  command(command: Parameters<typeof applyCommand>[1]): ReturnType<typeof applyCommand>;
  milestones(): MilestoneStatus[];
  canAdvanceAge(): boolean;
  perf(): PerfStats;
}

declare global {
  interface Window {
    __nova?: NovaHandle;
  }
}

export function attachDiagnostics(handle: NovaHandle): void {
  window.__nova = handle;
}
