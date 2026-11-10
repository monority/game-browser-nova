import type { ColonyStats } from "@/application/queries/stats.js";
import type { Alert, ResourceForecast, SurvivalResource } from "@/application/queries/analysis.js";
import { panel, sectionHeader, liveStatRow } from "./kit.js";
import { ENV_QUALITY_ALERT_THRESHOLD } from "@/domain/environment/environment.js";

/**
 * Stats + forecast + alerts panel: the single left column.
 * Tier2: built once, updated in place — updateStats writes only changed
 * text on persistent rows (no rebuild); forecast rows are persistent
 * <button>s keyed by resource; alerts rewrite only when their content
 * changes. refreshStats still calls updateStats → updateForecast →
 * setAlerts (order contract: rows, then forecast, then alerts).
 */

interface StatsPanel {
  element: HTMLDivElement;
  updateStats(stats: ColonyStats): void;
  updateForecast(forecasts: ResourceForecast[]): void;
  setAlerts(alerts: Alert[]): void;
}

export function createStatsPanel(callbacks: {
  onForecastRowClick(resource: SurvivalResource): void;
}): StatsPanel {
  const { element } = panel("stats");

  // Named rows keep updateStats independent of positional indices; the
  // literal order is the visual order (object insertion order is defined).
  const statRows = {
    tick: liveStatRow("Tick"),
    population: liveStatRow("Population"),
    money: liveStatRow("Money"),
    food: liveStatRow("Food"),
    water: liveStatRow("Water"),
    wood: liveStatRow("Wood"),
    stone: liveStatRow("Stone"),
    planks: liveStatRow("Planks"),
    pollution: liveStatRow("Pollution"),
    emitted: liveStatRow("  emitted/tick"),
    absorbed: liveStatRow("  absorbed/tick"),
    envQuality: liveStatRow("Env quality"),
    revenue: liveStatRow("Revenue/tick"),
    taxes: liveStatRow("  taxes"),
    commerce: liveStatRow("  commerce"),
    market: liveStatRow("  market"),
    maintenance: liveStatRow("Maintenance/tick"),
    net: liveStatRow("Net money/tick"),
  };
  for (const row of Object.values(statRows)) element.appendChild(row.element);

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
    statRows.tick.set(String(stats.tick));
    statRows.population.set(`${stats.population} / ${stats.housingCapacity}`);
    statRows.money.set(String(Math.floor(stats.resources.money)));
    statRows.food.set(`${Math.floor(stats.resources.food)} / ${stats.foodCapacity}`);
    statRows.water.set(`${Math.floor(stats.resources.water)} / ${stats.waterCapacity}`);
    statRows.wood.set(String(Math.floor(stats.resources.wood)));
    statRows.stone.set(String(Math.floor(stats.resources.stone)));
    statRows.planks.set(String(Math.floor(stats.resources.planks)));
    statRows.pollution.set(
      `${Math.round(stats.pollution)} · net ${stats.pollutionNetPerTick >= 0 ? "+" : ""}${stats.pollutionNetPerTick}/tick`,
      stats.pollutionNetPerTick > 0 ? "nova-value--danger" : "nova-value--ok",
    );
    statRows.emitted.set(String(stats.pollutionEmissionsPerTick));
    statRows.absorbed.set(String(stats.pollutionAbsorptionPerTick));
    statRows.envQuality.set(
      String(Math.round(stats.envQuality)),
      stats.envQuality < ENV_QUALITY_ALERT_THRESHOLD ? "nova-value--danger" : "nova-value--ok",
    );
    statRows.revenue.set(String(stats.revenuePerTick));
    statRows.taxes.set(String(stats.taxesPerTick));
    statRows.commerce.set(String(stats.commercePerTick));
    statRows.market.set(String(stats.marketPerTick));
    statRows.maintenance.set(String(stats.maintenancePerTick));
    statRows.net.set(
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
      const labelText = `${name} +${f.productionPerTick}/-${f.consumptionPerTick} per tick`;
      const valueText = `stock ${Math.floor(f.stock)}${remaining}`;
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
