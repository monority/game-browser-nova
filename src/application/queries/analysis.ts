import type { GameState } from "@/domain/simulation/state.js";
import {
  WATER_PER_WELL_PER_TICK,
  FOOD_PER_COLONIST_PER_TICK,
  WATER_PER_SERVED_COLONIST_PER_TICK,
  foodProductionPerTick,
} from "@/domain/production/production.js";
import {
  commercePerTick,
  expectedMarketSales,
  maintenancePerTick,
  taxesPerTick,
} from "@/domain/economy/economy.js";
import { isActive } from "@/domain/building/building.js";
import { environmentalQuality } from "@/domain/environment/environment.js";
import { plankThroughput } from "@/domain/production/transformation.js";
import { getStaffingOverview } from "./staffing.js";

/**
 * Derived analysis views (docs/DATA-CONTRACTS.md §5, docs/game/09-UI-UX.md).
 * Alerts communicate states, never instructions (design rule §7).
 */

export type SurvivalResource = "food" | "water";

export interface ResourceForecast {
  resource: SurvivalResource;
  productionPerTick: number;
  consumptionPerTick: number;
  balancePerTick: number;
  stock: number;
  /** Ticks until the stock empties; null while balance >= 0. */
  ticksRemaining: number | null;
}

function staffedProducers(state: GameState, type: "farm" | "well"): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (
      building.type === type &&
      isActive(building) &&
      building.staffed
    ) {
      count += 1;
    }
  }
  return count;
}

export function getResourceSummaries(state: GameState): Record<SurvivalResource, ResourceForecast> {
  const pop = state.population;
  const foodProduction = foodProductionPerTick(state);
  // Markets liquidate post-consumption surplus (Phase 9): the forecast balance
  // must show the drain, or ticks-remaining would lie while markets sell.
  const marketDrain = expectedMarketSales(state);
  const waterProduction = staffedProducers(state, "well") * WATER_PER_WELL_PER_TICK;
  const foodConsumption = pop * FOOD_PER_COLONIST_PER_TICK;
  // served colonists: consumption is capped by availability, but the *rate*
  // the colony needs is pop; the served amount is a shortage signal.
  const waterConsumption = Math.min(
    state.resources.water,
    pop * WATER_PER_SERVED_COLONIST_PER_TICK,
  );

  // Market sales are neither production nor consumption: apply the drain to the
  // food balance so ticks-remaining stays honest while markets sell (Step017).
  const withMarketDrain = (forecast: ResourceForecast, drain: number): ResourceForecast => {
    const balance = forecast.balancePerTick - drain;
    return {
      ...forecast,
      balancePerTick: balance,
      ticksRemaining: balance < 0 ? Math.floor(forecast.stock / -balance) : null,
    };
  };

  const summarize = (
    resource: SurvivalResource,
    production: number,
    consumption: number,
    stock: number,
  ): ResourceForecast => {
    const balance = production - consumption;
    return {
      resource,
      productionPerTick: production,
      consumptionPerTick: consumption,
      balancePerTick: balance,
      stock,
      ticksRemaining: balance < 0 ? Math.floor(stock / -balance) : null,
    };
  };

  return {
    food: withMarketDrain(summarize("food", foodProduction, foodConsumption, state.resources.food), marketDrain),
    water: summarize("water", waterProduction, waterConsumption, state.resources.water),
  };
}

export type AlertSeverity = "info" | "warning";

/** Drill-down: the buildings contributing to a survival resource. */
export interface ResourceContributor {
  id: string;
  type: string;
  x: number;
  y: number;
  staffed: boolean;
  active: boolean;
}

export interface ResourceContributors {
  resource: SurvivalResource;
  producers: ResourceContributor[];
  /** Aggregate consumer: the population. */
  consumptionPerTick: number;
}

export function getResourceContributors(
  state: GameState,
  resource: SurvivalResource,
): ResourceContributors {
  const type = resource === "food" ? "farm" : "well";
  const producers: ResourceContributor[] = Object.values(state.buildings)
    .filter((b) => b.type === type)
    .map((b) => ({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      staffed: b.staffed,
      active: b.active,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    resource,
    producers,
    consumptionPerTick:
      state.population *
      (resource === "food" ? FOOD_PER_COLONIST_PER_TICK : WATER_PER_SERVED_COLONIST_PER_TICK),
  };
}

export interface Alert {
  severity: AlertSeverity;
  message: string;
}

export function getAlerts(state: GameState): Alert[] {
  const alerts: Alert[] = [];
  const summaries = getResourceSummaries(state);

  if (summaries.food.balancePerTick < 0) {
    const ticks = summaries.food.ticksRemaining ?? 0;
    alerts.push({
      severity: "warning",
      message: `Food: ${summaries.food.balancePerTick}/tick · stock ${Math.floor(summaries.food.stock)} → ${ticks} ticks`,
    });
  } else if (state.population > 0 && state.resources.food === 0) {
    alerts.push({
      severity: "warning",
      message: `Food: 0 stock · population ${state.population} unfed next tick`,
    });
  }

  const waterServed = Math.min(state.resources.water, state.population);
  if (state.population > 0 && waterServed < state.population) {
    alerts.push({
      severity: "warning",
      message: `Water: ${waterServed}/${state.population} colonists served`,
    });
  }

  if (state.resources.money === 0 && summaries.food.balancePerTick >= 0) {
    // money net is only worth reporting when the treasury is stuck; the
    // shared economy functions keep this honest with the simulation (Step028)
    const net =
      taxesPerTick(state) +
      commercePerTick(state, plankThroughput(state)) -
      maintenancePerTick(state);
    if (net < 0) {
      alerts.push({
        severity: "warning",
        message: `Treasury: frozen at 0 · net ${net}/tick`,
      });
    }
  }

  const quality = environmentalQuality(state);
  if (quality < 50) {
    alerts.push({
      severity: quality < 25 ? "warning" : "info",
      message: `Environment: quality ${quality} · pollution ${Math.round(state.pollution)}`,
    });
  }

  // Workforce visibility (Step025): staff compete for workplaces in fixed
  // canonical order; a shortage shows as idle eligible workplaces. The alert
  // states the ratio only — the staffing order is inspectable per building.
  if (state.population > 0) {
    const staffing = getStaffingOverview(state);
    if (staffing.eligible > 0 && staffing.staffed < staffing.eligible) {
      alerts.push({
        severity: "info",
        message: `Workforce: ${staffing.staffed}/${staffing.eligible} workplaces staffed`,
      });
    }
  }

  return alerts;
}
