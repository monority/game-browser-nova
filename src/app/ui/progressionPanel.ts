import type { MilestoneStatus } from "../../domain/progression/progression.js";
import { panel, textButton, TOKENS } from "./kit.js";

/**
 * Progression panel (Step029 split): age header, milestone rows,
 * research list and the advance action. Re-rendered wholesale per
 * update — milestone/tech sets are small.
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
  const { element } = panel("progression", { bottom: "110px", right: "12px", width: "240px" });

  function sectionLabel(text: string): HTMLDivElement {
    const label = document.createElement("div");
    label.textContent = text;
    label.style.cssText =
      "color:" +
      TOKENS.muted +
      ";font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin:6px 0 2px";
    return label;
  }

  function update(info: ProgressionInfo): void {
    element.innerHTML = "";
    const header = document.createElement("div");
    header.textContent = `${info.ageName} (Age ${info.age})`;
    header.style.cssText = "font-weight:600;margin-bottom:6px";
    element.appendChild(header);

    element.appendChild(sectionLabel("Milestones"));
    for (const milestone of info.milestones) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between";
      const label = document.createElement("span");
      label.textContent = milestone.label;
      const value = document.createElement("span");
      value.textContent = milestone.done
        ? "✓"
        : `${Math.min(milestone.value, milestone.threshold)}/${milestone.threshold}`;
      value.style.color = milestone.done ? TOKENS.ok : TOKENS.text;
      row.append(label, value);
      element.appendChild(row);
    }

    const researchHeader = sectionLabel("Research");
    researchHeader.style.margin = "8px 0 2px";
    element.appendChild(researchHeader);
    const researched = document.createElement("div");
    researched.textContent =
      info.researchedTechs.length > 0
        ? "Researched: " +
          info.researchedTechs.map((id) => TECH_NAMES[id] ?? id).join(", ")
        : "Researched: none";
    researched.style.cssText = "color:" + TOKENS.muted + ";margin-bottom:4px";
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
      advance.style.borderColor = TOKENS.borderActive;
      element.appendChild(advance);
    }
  }

  return { element, update };
}
