import type { ResourceContributors } from "../../application/queries/analysis.js";
import { panel, staticNote, textButton, TOKENS } from "./kit.js";

/**
 * Inspection panel (Step029 split): the right column — building
 * inspection (with mothball/remove actions) and analysis drill-down
 * share this panel; the latest selection wins.
 */

export interface RemoveBuildingInfo {
  kind: "building";
  id: string;
  label: string;
  detail?: string;
  active: boolean;
  /** Staffing state line for workplaces (states only, Step025). */
  staffing?: string;
}

export interface RemoveRoadInfo {
  kind: "road";
  cell: string;
  label: string;
}

export type InspectionInfo = RemoveBuildingInfo | RemoveRoadInfo | null;

export interface InspectionPanel {
  element: HTMLDivElement;
  showInspection(info: InspectionInfo): void;
  showDrillDown(info: ResourceContributors | null): void;
}

export function createInspectionPanel(callbacks: {
  onRemoveBuilding(id: string): void;
  onRemoveRoadCell(cell: string): void;
  onSetBuildingActive(id: string, active: boolean): void;
}): InspectionPanel {
  let currentInspection: InspectionInfo = null;

  const { element } = panel("inspection", { top: "12px", right: "12px", width: "220px" });
  element.style.display = "none";

  const inspectionLabel = document.createElement("div");
  inspectionLabel.style.marginBottom = "6px";

  const deactivateButton = textButton("Mothball", "deactivate-building", () => {
    const info = currentInspection;
    if (info && info.kind === "building") callbacks.onSetBuildingActive(info.id, false);
  });
  const reactivateButton = textButton("Reactivate", "reactivate-building", () => {
    const info = currentInspection;
    if (info && info.kind === "building") callbacks.onSetBuildingActive(info.id, true);
  });
  const removeBuildingButton = textButton("Remove", "remove-building", () => {
    const info = currentInspection;
    if (info && info.kind === "building") callbacks.onRemoveBuilding(info.id);
    showInspection(null);
  });
  const removeRoadButton = textButton("Remove road cell", "remove-road", () => {
    const info = currentInspection;
    if (info && info.kind === "road") callbacks.onRemoveRoadCell(info.cell);
    showInspection(null);
  });

  function showDrillDown(info: ResourceContributors | null): void {
    // the right panel is shared between building inspection and analysis
    // drill-down — the latest selection wins
    element.innerHTML = "";
    if (!info) {
      element.style.display = "none";
      return;
    }
    element.style.display = "block";
    element.dataset.drilldown = info.resource;
    const header = document.createElement("div");
    header.textContent = `${info.resource.charAt(0).toUpperCase() + info.resource.slice(1)} — contributors`;
    header.style.cssText = "margin-bottom:6px;font-weight:600";
    element.appendChild(header);
    const consumer = document.createElement("div");
    consumer.textContent = `Consumption: ${info.consumptionPerTick}/tick (population)`;
    consumer.style.cssText = "margin-bottom:6px;color:" + TOKENS.muted;
    element.appendChild(consumer);
    if (info.producers.length === 0) {
      element.appendChild(staticNote("No producing buildings."));
      return;
    }
    for (const p of info.producers) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between";
      const name = document.createElement("span");
      name.textContent = `${p.type} · ${p.id} @ ${p.x},${p.y}`;
      const stateSpan = document.createElement("span");
      const stateText = !p.active ? "mothballed" : p.staffed ? "staffed" : "idle";
      stateSpan.textContent = stateText;
      stateSpan.style.color = !p.active ? TOKENS.muted : p.staffed ? TOKENS.ok : TOKENS.warn;
      row.append(name, stateSpan);
      element.appendChild(row);
    }
  }

  function showInspection(info: InspectionInfo): void {
    currentInspection = info;
    element.innerHTML = "";
    if (!info) {
      element.style.display = "none";
      return;
    }
    element.style.display = "block";
    element.dataset.inspection = info.kind === "building" ? info.id : "road";
    delete element.dataset.drilldown;
    inspectionLabel.textContent = info.label;
    element.appendChild(inspectionLabel);
    if (info.kind === "building") {
      if (info.detail) {
        const detail = staticNote(info.detail);
        detail.style.marginBottom = "6px";
        element.appendChild(detail);
      }
      if (info.staffing) {
        const staffing = staticNote(info.staffing);
        staffing.dataset.staffing = info.id;
        staffing.style.marginBottom = "6px";
        element.appendChild(staffing);
      }
      if (info.id === "colony-center") {
        element.appendChild(
          staticNote("The Colony Center anchor cannot be removed or mothballed."),
        );
      } else if (info.active) {
        element.appendChild(deactivateButton);
        element.appendChild(removeBuildingButton);
      } else {
        element.appendChild(reactivateButton);
        element.appendChild(removeBuildingButton);
      }
    } else {
      element.appendChild(removeRoadButton);
    }
  }

  return { element, showInspection, showDrillDown };
}
