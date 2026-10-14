import type { ColonyStats } from "../../application/queries/stats.js";
import type { Alert, ResourceForecast, SurvivalResource } from "../../application/queries/analysis.js";
import { panel, sectionHeader, statRow, TOKENS } from "./kit.js";

/**
 * Stats + forecast + alerts panel (Step029 split): the single left
 * column. updateStats repaints the stat rows (wiping forecast/alerts —
 * the caller re-appends them right after, refreshStats order contract).
 */

export interface StatsPanel {
  element: HTMLDivElement;
  updateStats(stats: ColonyStats): void;
  updateForecast(forecasts: ResourceForecast[]): void;
  setAlerts(alerts: Alert[]): void;
}

export function createStatsPanel(callbacks: {
  onForecastRowClick(resource: SurvivalResource): void;
}): StatsPanel {
  const { element } = panel("stats", {
    top: "12px",
    left: "12px",
    width: "210px",
    maxHeight: "60vh",
    overflowY: "auto",
  });

  function updateStats(stats: ColonyStats): void {
    element.innerHTML = "";
    const rows: Array<[string, string]> = [
      ["Tick", String(stats.tick)],
      ["Population", `${stats.population} / ${stats.housingCapacity}`],
      ["Money", String(Math.floor(stats.resources.money))],
      ["Food", String(Math.floor(stats.resources.food))],
      ["Water", String(Math.floor(stats.resources.water))],
      ["Wood", String(Math.floor(stats.resources.wood))],
      ["Stone", String(Math.floor(stats.resources.stone))],
      ["Planks", String(Math.floor(stats.resources.planks))],
      ["Pollution", String(Math.round(stats.pollution))],
      ["Env quality", String(Math.round(stats.envQuality))],
      ["Revenue/tick", String(stats.revenuePerTick)],
      ["  taxes", String(stats.taxesPerTick)],
      ["  commerce", String(stats.commercePerTick)],
      ["  market", String(stats.marketPerTick)],
      ["Maintenance/tick", String(stats.maintenancePerTick)],
      ["Net money/tick", String(stats.netMoneyPerTick)],
    ];
    for (const [label, value] of rows) {
      const row = statRow(label, value);
      if (label === "Net money/tick") {
        (row.children[1] as HTMLElement).style.color =
          stats.netMoneyPerTick >= 0 ? TOKENS.ok : TOKENS.danger;
      }
      element.appendChild(row);
    }
  }

  function updateForecast(forecasts: ResourceForecast[]): void {
    // remove previous forecast + alert sections, re-append fresh
    element
      .querySelectorAll("[data-section='forecast'], [data-section='alerts']")
      .forEach((n) => n.remove());
    const section = document.createElement("div");
    section.dataset.section = "forecast";
    const header = sectionHeader("Forecast");
    header.style.margin = "8px 0 2px";
    section.appendChild(header);
    for (const f of forecasts) {
      const name = f.resource.charAt(0).toUpperCase() + f.resource.slice(1);
      const remaining = f.ticksRemaining !== null ? ` → ${f.ticksRemaining} ticks` : "";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;cursor:pointer";
      row.title = "Click: show contributing buildings";
      row.dataset.resource = f.resource;
      const label = document.createElement("span");
      label.textContent = `${name} ${f.productionPerTick}/${f.consumptionPerTick}`;
      const value = document.createElement("span");
      value.textContent = `${Math.floor(f.stock)}${remaining}`;
      value.style.color = f.balancePerTick < 0 ? TOKENS.danger : TOKENS.text;
      row.append(label, value);
      row.addEventListener("click", () => callbacks.onForecastRowClick(f.resource));
      section.appendChild(row);
    }
    element.appendChild(section);
  }

  function setAlerts(alerts: Alert[]): void {
    element
      .querySelectorAll("[data-section='alerts']")
      .forEach((n) => n.remove());
    if (alerts.length === 0) return;
    const section = document.createElement("div");
    section.dataset.section = "alerts";
    for (const alert of alerts) {
      const line = document.createElement("div");
      line.textContent = alert.message;
      line.style.color = alert.severity === "warning" ? TOKENS.warn : TOKENS.muted;
      section.appendChild(line);
    }
    element.appendChild(section);
  }

  return { element, updateStats, updateForecast, setAlerts };
}
