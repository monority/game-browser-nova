import type { ColonyStats } from "@/application/queries/stats.js";
import type { Alert, ResourceForecast, SurvivalResource } from "@/application/queries/analysis.js";
import { panel, row, sectionHeader, statRow } from "./kit.js";

/**
 * Stats + forecast + alerts panel: the single left column.
 * updateStats repaints the stat rows (wiping forecast/alerts — the
 * caller re-appends them right after, refreshStats order contract).
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
  const { element } = panel("stats");

  function updateStats(stats: ColonyStats): void {
    element.innerHTML = "";
    const rows: Array<[string, string]> = [
      ["Tick", String(stats.tick)],
      ["Population", `${stats.population} / ${stats.housingCapacity}`],
      ["Money", String(Math.floor(stats.resources.money))],
      ["Food", `${Math.floor(stats.resources.food)} / ${stats.foodCapacity}`],
      ["Water", `${Math.floor(stats.resources.water)} / ${stats.waterCapacity}`],
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
      if (label === "Net money/tick") {
        const valueClass = stats.netMoneyPerTick >= 0 ? "nova-value--ok" : "nova-value--danger";
        element.appendChild(statRow(label, value, valueClass));
      } else {
        element.appendChild(statRow(label, value));
      }
    }
  }

  function updateForecast(forecasts: ResourceForecast[]): void {
    // remove previous forecast + alert sections, re-append fresh
    element
      .querySelectorAll("[data-section='forecast'], [data-section='alerts']")
      .forEach((n) => n.remove());
    const section = document.createElement("div");
    section.dataset.section = "forecast";
    section.appendChild(sectionHeader("Forecast", true));
    for (const f of forecasts) {
      const name = f.resource.charAt(0).toUpperCase() + f.resource.slice(1);
      const remaining = f.ticksRemaining !== null ? ` → ${f.ticksRemaining} ticks` : "";
      const rowEl = row("nova-row--between nova-forecast-row");
      rowEl.title = "Click: show contributing buildings";
      rowEl.dataset.resource = f.resource;
      const label = document.createElement("span");
      label.textContent = `${name} ${f.productionPerTick}/${f.consumptionPerTick}`;
      const value = document.createElement("span");
      value.textContent = `${Math.floor(f.stock)}${remaining}`;
      if (f.balancePerTick < 0) value.className = "nova-value--danger";
      rowEl.append(label, value);
      rowEl.addEventListener("click", () => callbacks.onForecastRowClick(f.resource));
      section.appendChild(rowEl);
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
    section.className = "nova-alerts";
    for (const alert of alerts) {
      const line = document.createElement("div");
      line.textContent = alert.message;
      line.className =
        alert.severity === "warning" ? "nova-alert--warning" : "nova-alert--info";
      section.appendChild(line);
    }
    element.appendChild(section);
  }

  return { element, updateStats, updateForecast, setAlerts };
}
