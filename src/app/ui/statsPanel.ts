import type { ColonyStats } from "@/application/queries/stats.js";
import type { Alert, ResourceForecast, SurvivalResource } from "@/application/queries/analysis.js";
import { panel, sectionHeader, liveStatRow, type LiveStatRow } from "./kit.js";

/**
 * Stats + forecast + alerts panel: the single left column.
 * Tier2: built once, updated in place — updateStats writes only changed
 * text on persistent rows (no rebuild); forecast rows are persistent
 * <button>s keyed by resource; alerts rewrite only when their content
 * changes. refreshStats still calls updateStats → updateForecast →
 * setAlerts (order contract: rows, then forecast, then alerts).
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

  const statRows: LiveStatRow[] = [
    liveStatRow("Tick"),
    liveStatRow("Population"),
    liveStatRow("Money"),
    liveStatRow("Food"),
    liveStatRow("Water"),
    liveStatRow("Wood"),
    liveStatRow("Stone"),
    liveStatRow("Planks"),
    liveStatRow("Pollution"),
    liveStatRow("Env quality"),
    liveStatRow("Revenue/tick"),
    liveStatRow("  taxes"),
    liveStatRow("  commerce"),
    liveStatRow("  market"),
    liveStatRow("Maintenance/tick"),
    liveStatRow("Net money/tick"),
  ];
  for (const row of statRows) element.appendChild(row.element);

  const forecastSection = document.createElement("div");
  forecastSection.dataset.section = "forecast";
  forecastSection.appendChild(sectionHeader("Forecast", true));
  element.appendChild(forecastSection);

  const alertsSection = document.createElement("div");
  alertsSection.dataset.section = "alerts";
  alertsSection.className = "nova-alerts";
  alertsSection.hidden = true;
  element.appendChild(alertsSection);

  // forecast rows persist; click listeners attach once (no per-tick rebind)
  const forecastRows = new Map<SurvivalResource, {
    rowEl: HTMLButtonElement;
    label: HTMLSpanElement;
    value: HTMLSpanElement;
  }>();
  let lastAlertSignature = "";

  function updateStats(stats: ColonyStats): void {
    statRows[0]!.set(String(stats.tick));
    statRows[1]!.set(`${stats.population} / ${stats.housingCapacity}`);
    statRows[2]!.set(String(Math.floor(stats.resources.money)));
    statRows[3]!.set(`${Math.floor(stats.resources.food)} / ${stats.foodCapacity}`);
    statRows[4]!.set(`${Math.floor(stats.resources.water)} / ${stats.waterCapacity}`);
    statRows[5]!.set(String(Math.floor(stats.resources.wood)));
    statRows[6]!.set(String(Math.floor(stats.resources.stone)));
    statRows[7]!.set(String(Math.floor(stats.resources.planks)));
    statRows[8]!.set(String(Math.round(stats.pollution)));
    statRows[9]!.set(String(Math.round(stats.envQuality)));
    statRows[10]!.set(String(stats.revenuePerTick));
    statRows[11]!.set(String(stats.taxesPerTick));
    statRows[12]!.set(String(stats.commercePerTick));
    statRows[13]!.set(String(stats.marketPerTick));
    statRows[14]!.set(String(stats.maintenancePerTick));
    statRows[15]!.set(
      String(stats.netMoneyPerTick),
      stats.netMoneyPerTick >= 0 ? "nova-value--ok" : "nova-value--danger",
    );
  }

  function updateForecast(forecasts: ResourceForecast[]): void {
    const seen = new Set<SurvivalResource>();
    for (const f of forecasts) {
      seen.add(f.resource);
      const name = f.resource.charAt(0).toUpperCase() + f.resource.slice(1);
      const remaining = f.ticksRemaining !== null ? ` → ${f.ticksRemaining} ticks` : "";
      const labelText = `${name} ${f.productionPerTick}/${f.consumptionPerTick}`;
      const valueText = `${Math.floor(f.stock)}${remaining}`;
      const valueClass = f.balancePerTick < 0 ? "nova-value--danger" : "";

      let row = forecastRows.get(f.resource);
      if (!row) {
        const rowEl = document.createElement("button");
        rowEl.type = "button";
        rowEl.className = "nova-row nova-row--between nova-forecast-row";
        rowEl.title = "Click: show contributing buildings";
        rowEl.dataset.resource = f.resource;
        const label = document.createElement("span");
        const value = document.createElement("span");
        rowEl.append(label, value);
        rowEl.addEventListener("click", () => callbacks.onForecastRowClick(f.resource));
        forecastSection.appendChild(rowEl);
        row = { rowEl, label, value };
        forecastRows.set(f.resource, row);
      }
      if (row.label.textContent !== labelText) row.label.textContent = labelText;
      if (row.value.textContent !== valueText) row.value.textContent = valueText;
      if (row.value.className !== valueClass) row.value.className = valueClass;
    }
    for (const [resource, row] of forecastRows) {
      if (!seen.has(resource)) {
        row.rowEl.remove();
        forecastRows.delete(resource);
      }
    }
  }

  function setAlerts(alerts: Alert[]): void {
    // full-message signature: visual lines must track changing numbers;
    // identical content skips the rewrite entirely (common healthy case)
    const signature = alerts.map((a) => `${a.severity}:${a.message}`).join("\n");
    if (signature === lastAlertSignature) return;
    lastAlertSignature = signature;
    alertsSection.replaceChildren();
    for (const alert of alerts) {
      const line = document.createElement("div");
      line.textContent = alert.message;
      line.className =
        alert.severity === "warning" ? "nova-alert--warning" : "nova-alert--info";
      alertsSection.appendChild(line);
    }
    alertsSection.hidden = alerts.length === 0;
  }

  return { element, updateStats, updateForecast, setAlerts };
}
