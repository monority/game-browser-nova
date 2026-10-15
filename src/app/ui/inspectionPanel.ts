import type { ResourceContributors } from "@/application/queries/analysis.js";
import { panel, row, staticNote, textButton } from "./kit.js";

/**
 * Inspection panel: the right column — building inspection (with
 * mothball/remove actions) and analysis drill-down share this panel;
 * the latest selection wins. Visibility = native hidden attribute.
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

  const { element } = panel("inspection");
  element.hidden = true;

  const inspectionLabel = document.createElement("div");
  inspectionLabel.className = "nova-label";

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
      element.hidden = true;
      return;
    }
    element.hidden = false;
    element.dataset.drilldown = info.resource;
    const header = document.createElement("div");
    header.textContent = `${info.resource.charAt(0).toUpperCase() + info.resource.slice(1)} — contributors`;
    header.className = "nova-title";
    element.appendChild(header);
    element.appendChild(
      staticNote(`Consumption: ${info.consumptionPerTick}/tick (population)`, "nova-note--mb"),
    );
    if (info.producers.length === 0) {
      element.appendChild(staticNote("No producing buildings."));
      return;
    }
    for (const p of info.producers) {
      const rowEl = row("nova-row--between");
      const name = document.createElement("span");
      name.textContent = `${p.type} · ${p.id} @ ${p.x},${p.y}`;
      const stateSpan = document.createElement("span");
      stateSpan.textContent = !p.active ? "mothballed" : p.staffed ? "staffed" : "idle";
      stateSpan.className = !p.active
        ? "nova-muted"
        : p.staffed
          ? "nova-value--ok"
          : "nova-value--warn";
      rowEl.append(name, stateSpan);
      element.appendChild(rowEl);
    }
  }

  function showInspection(info: InspectionInfo): void {
    currentInspection = info;
    element.innerHTML = "";
    if (!info) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    element.dataset.inspection = info.kind === "building" ? info.id : "road";
    delete element.dataset.drilldown;
    inspectionLabel.textContent = info.label;
    element.appendChild(inspectionLabel);
    if (info.kind === "building") {
      if (info.detail) {
        element.appendChild(staticNote(info.detail, "nova-note--mb"));
      }
      if (info.staffing) {
        const staffing = staticNote(info.staffing, "nova-note--mb");
        staffing.dataset.staffing = info.id;
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
