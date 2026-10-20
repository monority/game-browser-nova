import type { MilestoneStatus } from "@/domain/progression/progression.js";
import { panel, sectionHeader, liveStatRow, textButton, type LiveStatRow } from "./kit.js";

/**
 * Progression panel: age header, milestone rows, research list and the
 * advance action. Tier2: the DOM shell rebuilds only when the structure
 * changes (age, milestone set, available techs, advance availability);
 * milestone values and the researched line update in place every tick.
 */

export interface ProgressionInfo {
  age: number;
  ageName: string;
  milestones: MilestoneStatus[];
  canAdvance: boolean;
  availableTechs: Array<{ id: string; displayName: string; cost: number }>;
  researchedTechs: string[];
}

export interface ProgressionPanel {
  element: HTMLDivElement;
  update(info: ProgressionInfo): void;
}

const TECH_NAMES: Record<string, string> = {
  cropRotation: "Crop Rotation",
  masonry: "Masonry",
  tradeRoutes: "Trade Routes",
  irrigation: "Irrigation",
  deepMining: "Deep Mining",
};

export function createProgressionPanel(callbacks: {
  onResearchTech(techId: string): void;
  onAdvanceAge(): void;
}): ProgressionPanel {
  const { element } = panel("progression");

  let lastStructure = "";
  let milestoneRows = new Map<string, LiveStatRow>();
  let researchedLine: HTMLDivElement | null = null;

  /** Rebuild the panel shape: header, milestone rows, tech buttons. */
  function rebuildShell(info: ProgressionInfo): void {
    element.replaceChildren();
    milestoneRows = new Map();
    researchedLine = null;

    const header = document.createElement("div");
    header.textContent = `${info.ageName} (Age ${info.age})`;
    header.className = "nova-title";
    element.appendChild(header);

    element.appendChild(sectionHeader("Milestones"));
    for (const milestone of info.milestones) {
      const row = liveStatRow(milestone.label);
      milestoneRows.set(milestone.id, row);
      element.appendChild(row.element);
    }

    element.appendChild(sectionHeader("Research", true));
    researchedLine = document.createElement("div");
    researchedLine.className = "nova-sub";
    element.appendChild(researchedLine);
    for (const tech of info.availableTechs) {
      const button = textButton(`${tech.displayName} (${tech.cost}$)`, `research-${tech.id}`, () => {
        callbacks.onResearchTech(tech.id);
      });
      element.appendChild(button);
    }

    if (info.canAdvance) {
      const advance = textButton(`Advance to Age ${info.age + 1}`, "advance-age", () => {
        callbacks.onAdvanceAge();
      });
      advance.classList.add("nova-btn--accent");
      element.appendChild(advance);
    }
  }

  function update(info: ProgressionInfo): void {
    // structure = what the DOM shape depends on; values below update in place
    const structure = JSON.stringify({
      age: info.age,
      ageName: info.ageName,
      milestoneIds: info.milestones.map((m) => m.id),
      techIds: info.availableTechs.map((t) => t.id),
      canAdvance: info.canAdvance,
    });
    if (structure !== lastStructure) {
      lastStructure = structure;
      rebuildShell(info);
    }
    for (const milestone of info.milestones) {
      const row = milestoneRows.get(milestone.id);
      if (!row) continue;
      row.set(
        milestone.done
          ? "✓"
          : `${Math.min(milestone.value, milestone.threshold)}/${milestone.threshold}`,
        milestone.done ? "nova-value--ok" : undefined,
      );
    }
    if (researchedLine) {
      const text =
        info.researchedTechs.length > 0
          ? "Researched: " +
            info.researchedTechs.map((id) => TECH_NAMES[id] ?? id).join(", ")
          : "Researched: none";
      if (researchedLine.textContent !== text) researchedLine.textContent = text;
    }
  }

  return { element, update };
}
