import type { MilestoneStatus } from "../../domain/progression/progression.js";
import { panel, sectionHeader, statRow, textButton } from "./kit.js";

/**
 * Progression panel: age header, milestone rows, research list and the
 * advance action. Re-rendered wholesale per update — milestone/tech
 * sets are small.
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

  function update(info: ProgressionInfo): void {
    element.innerHTML = "";
    const header = document.createElement("div");
    header.textContent = `${info.ageName} (Age ${info.age})`;
    header.className = "nova-title";
    element.appendChild(header);

    element.appendChild(sectionHeader("Milestones"));
    for (const milestone of info.milestones) {
      const valueClass = milestone.done ? "nova-value--ok" : undefined;
      element.appendChild(
        statRow(
          milestone.label,
          milestone.done
            ? "✓"
            : `${Math.min(milestone.value, milestone.threshold)}/${milestone.threshold}`,
          valueClass,
        ),
      );
    }

    element.appendChild(sectionHeader("Research", true));
    const researched = document.createElement("div");
    researched.textContent =
      info.researchedTechs.length > 0
        ? "Researched: " +
          info.researchedTechs.map((id) => TECH_NAMES[id] ?? id).join(", ")
        : "Researched: none";
    researched.className = "nova-sub";
    element.appendChild(researched);
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

  return { element, update };
}
