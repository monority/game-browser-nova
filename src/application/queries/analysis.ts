import type { GameState } from "@/domain/simulation/state.js";
import {
  FOOD_PER_COLONIST_PER_TICK,
  WATER_PER_SERVED_COLONIST_PER_TICK,
  foodProductionPerTick,
  waterProductionPerTick,
} from "@/domain/production/production.js";
import {
  FOOD_SOLD_PER_MARKET_PER_TICK,
  commercePerTick,
  connectedMarkets,
  expectedMarketSales,
  maintenancePerTick,
  marketSafetyStock,
  taxesPerTick,
} from "@/domain/economy/economy.js";
import { compareCellCoords } from "@/domain/shared/cells.js";
import {
  ENV_QUALITY_ALERT_THRESHOLD,
  environmentalQuality,
  MIN_QUALITY_FOR_ADMISSION,
} from "@/domain/environment/environment.js";
import { housingCapacity } from "@/domain/population/population.js";
import { plankThroughput } from "@/domain/production/transformation.js";
import { foodCapacity, waterCapacity } from "@/domain/storage/storage.js";
import type { ActiveEvent } from "@/domain/events/events.js";
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

export function getResourceSummaries(state: GameState): Record<SurvivalResource, ResourceForecast> {
  const pop = state.population;
  const foodProduction = foodProductionPerTick(state);
  // Markets liquidate post-consumption surplus (Phase 9): the forecast balance
  // must show the drain, or ticks-remaining would lie while markets sell.
  const marketDrain = expectedMarketSales(state);
  const waterProduction = waterProductionPerTick(state);
  const foodConsumption = pop * FOOD_PER_COLONIST_PER_TICK;
  // Forecast consumption is the need, not the served amount (F12): showing
  // min(stock, need) turned a shortage into a fake surplus. The served amount
  // remains the shortage signal in getAlerts.
  const waterConsumption = pop * WATER_PER_SERVED_COLONIST_PER_TICK;

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

type AlertSeverity = "info" | "warning";

/** Drill-down: the buildings contributing to a survival resource. */
interface ResourceContributor {
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
    .sort(compareCellCoords);
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

/** Event alert copy (Step047, P1'/P2 wording Step049): the effect and the
 * remaining span. */
function eventAlertLine(event: ActiveEvent): string {
  switch (event.kind) {
    case "drought":
      return `Drought: wells at half output · ${event.ticksLeft} ticks left`;
    case "tradeClosure":
      return `Trade routes closed: workshop floor halved · ${event.ticksLeft} ticks left`;
    case "bountifulHarvest":
      return `Bountiful harvest: granary +40 food · ${event.ticksLeft} ticks left`;
  }
}

function eventAlertSeverity(kind: ActiveEvent["kind"]): AlertSeverity {
  return kind === "bountifulHarvest" ? "info" : "warning";
}

/**
 * `summaries` is optional: refreshStats (boot) already computes
 * getResourceSummaries once per tick and passes it in — avoiding a
 * duplicate projection. Callers without summaries pay the default.
 */
export function getAlerts(
  state: GameState,
  summaries: Record<SurvivalResource, ResourceForecast> = getResourceSummaries(state),
): Alert[] {
  const alerts: Alert[] = [];

  // Active controlled events first (Step047): states with their remaining
  // duration, never instructions (design rule §7).
  for (const event of state.events) {
    alerts.push({ severity: eventAlertSeverity(event.kind), message: eventAlertLine(event) });
  }

  if (summaries.food.balancePerTick < 0) {
    const ticks = summaries.food.ticksRemaining ?? 0;
    alerts.push({
      severity: "warning",
      message: `Food: ${summaries.food.balancePerTick}/tick · stock ${Math.floor(summaries.food.stock)} → ${ticks} ticks`,
    });
  } else if (state.population > 0 && state.resources.food === 0) {
    alerts.push({
      severity: "warning",
      message: `Food: 0 stock · ${state.population} colonists unfed (−1/tick)`,
    });
  }

  // Served count, not the residual stock: the tick drinks from stock +
  // production, so a granary rest of 22 with a production of 24 serves all
  // 24 colonists. Comparing the post-consumption stock reported a shortage
  // in every colony whose reserve sat below its population (Step063:
  // measured on the age-3 line, 12 wells, water 22/80, pop 24, full service).
  const waterServed = Math.min(
    state.resources.water + waterProductionPerTick(state),
    state.population,
  );
  if (state.population > 0 && waterServed < state.population) {
    alerts.push({
      severity: "warning",
      message: `Water: ${waterServed}/${state.population} colonists served`,
    });
  }

  // Storage pressure (Step031): stock pinned at capacity while the
  // balance stays positive means production is wasted each tick.
  // States the cause only — the fix (warehouse / fewer producers) is
  // the player's call.
  const foodCap = foodCapacity(state);
  if (summaries.food.balancePerTick > 0 && state.resources.food >= foodCap) {
    alerts.push({
      severity: "warning",
      message: `Food storage full (${Math.floor(state.resources.food)}/${foodCap}) · +${summaries.food.balancePerTick}/tick wasted`,
    });
  }
  const waterCap = waterCapacity(state);
  if (summaries.water.balancePerTick > 0 && state.resources.water >= waterCap) {
    alerts.push({
      severity: "warning",
      message: `Water storage full (${Math.floor(state.resources.water)}/${waterCap}) · +${summaries.water.balancePerTick}/tick wasted`,
    });
  }

  // Market throttled by the safety stock (Step062): without this line a
  // market earning 0 looks broken, while it is simply holding the next meal
  // back. States the two facts (throughput, stock) and nothing else.
  const markets = connectedMarkets(state);
  if (
    markets > 0 &&
    expectedMarketSales(state) === 0 &&
    state.resources.food > 0 &&
    state.resources.food >= marketSafetyStock(state)
  ) {
    alerts.push({
      severity: "info",
      message: `Market: 0/${markets * FOOD_SOLD_PER_MARKET_PER_TICK} food sold · stock ${Math.floor(state.resources.food)} covers the next meal`,
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
  if (quality < ENV_QUALITY_ALERT_THRESHOLD) {
    alerts.push({
      severity: quality < 25 ? "warning" : "info",
      message: `Environment: quality ${quality} · pollution ${Math.round(state.pollution)}`,
    });
  }

  // Growth blocked by air quality (Step053 F1): states the exact gate —
  // quality, admission threshold, pollution — never an instruction.
  if (
    state.population > 0 &&
    state.population < housingCapacity(state) &&
    state.resources.food > 0 &&
    quality < MIN_QUALITY_FOR_ADMISSION
  ) {
    alerts.push({
      severity: "warning",
      message: `Growth blocked: air quality ${Math.round(quality)} < admission threshold ${MIN_QUALITY_FOR_ADMISSION} (pollution ${Math.round(state.pollution)})`,
    });
  }

  // Workforce access (Step025, reworked Step057 F5): the staffed/eligible
  // ratio is a permanent stat row now — information without a permanent
  // alert on every tick of a structural shortage (more workplaces than
  // colonists is normal in the D2 opening). The alert stream only carries a
  // fixable defect: an operational workplace that no road reaches. Idle by
  // workforce alone has no state-only remedy and stays out of the alerts
  // (per-building staffing rank remains inspectable).
  const unconnected = getStaffingOverview(state).unconnected;
  if (unconnected > 0) {
    alerts.push({
      severity: "info",
      message: `Workplaces: ${unconnected} without road access`,
    });
  }

  return alerts;
}
