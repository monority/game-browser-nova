import type { GameState } from "@/domain/simulation/state.js";
import {
  FOOD_PER_COLONIST_PER_TICK,
  WATER_PER_SERVED_COLONIST_PER_TICK,
  foodProductionPerTick,
  waterProductionPerTick,
} from "@/domain/production/production.js";
import {
  commercePerTick,
  crowdingCostPerTick,
  maintenancePerTick,
  taxesPerTick,
  waterEmergencyCostPerTick,
} from "@/domain/economy/economy.js";
import { compareCellCoords } from "@/domain/shared/cells.js";
import {
  ENV_QUALITY_ALERT_THRESHOLD,
  admissionGate,
  environmentalQuality,
  MIN_QUALITY_FOR_ADMISSION,
  pollutionFlows,
  pollutionTicksToAdmissionBlock,
} from "@/domain/environment/environment.js";
import { housingCapacity, ticksUntilWaterDeparture } from "@/domain/population/population.js";
import {
  WATER_DEPARTURE_INTERVAL_TICKS,
  waterBalancePerTick,
  waterPressureLevel,
  waterServed,
} from "@/domain/water/water.js";
import { foodCapacity, waterCapacity } from "@/domain/storage/storage.js";
import { foodTicksRemaining, projectFoodTick } from "@/domain/storage/spoilage.js";
import { forecastFoodReserve, type FoodReserveForecast } from "@/domain/storage/reserve.js";
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
  /**
   * Conservation loss the coming tick will apply (Step067, exact basis since
   * Step069: computed on the post-harvest stock, as the phase does). 0 for
   * water, which does not degrade.
   */
  spoilagePerTick: number;
  /** production − consumption: the harness balance, spoilage excluded. */
  balancePerTick: number;
  /**
   * Exact stock change of the coming tick, in the pipeline's order
   * (production → conservation → consumption → storage cap). Equals
   * `balance − spoilage` while the colony eats its full need and is not at
   * the cap; differs when it starves or wastes at the cap, and the exact
   * value is the one the tick will show.
   */
  netPerTick: number;
  stock: number;
  /**
   * Ticks until the stock empties, under the law the tick actually applies
   * (spoilage shrinks with the stock, so stock / (−net) would overstate it).
   * null when the granary never empties: the law's fixed point is positive,
   * which `production >= consumption` does NOT guarantee at 3%/tick.
   */
  ticksRemaining: number | null;
  /**
   * Food only (Step069): the Step068 reserve doctrine applied to THIS
   * colony — target, achievable reserve, autonomy and the deficit / thin /
   * building / funded / storage-limited status. The cockpit reads this
   * instead of re-deriving a forecast of its own.
   */
  reserve?: FoodReserveForecast;
}

export function getResourceSummaries(state: GameState): Record<SurvivalResource, ResourceForecast> {
  const pop = state.population;
  const foodProduction = foodProductionPerTick(state);
  const waterProduction = waterProductionPerTick(state);
  const foodConsumption = pop * FOOD_PER_COLONIST_PER_TICK;
  // Forecast consumption is the need, not the served amount (F12): showing
  // min(stock, need) turned a shortage into a fake surplus. The served amount
  // remains the shortage signal in getAlerts.
  const waterConsumption = pop * WATER_PER_SERVED_COLONIST_PER_TICK;

  const summarize = (
    resource: SurvivalResource,
    production: number,
    consumption: number,
    stock: number,
    spoilage: number,
    net: number,
    ticksRemaining: number | null,
    reserve?: FoodReserveForecast,
  ): ResourceForecast => {
    const balance = production - consumption;
    return {
      resource,
      productionPerTick: production,
      consumptionPerTick: consumption,
      spoilagePerTick: spoilage,
      balancePerTick: balance,
      netPerTick: net,
      stock,
      ticksRemaining,
      ...(reserve ? { reserve } : {}),
    };
  };

  // Food goes through the tick's own projection (Step069): the harvest and the
  // conservation loss of the coming tick are read in the pipeline's order, so
  // the numbers shown are the numbers the tick will apply.
  const foodTick = projectFoodTick(state);
  const waterBalance = waterBalancePerTick(waterProduction, pop);
  return {
    food: summarize(
      "food",
      foodProduction,
      foodConsumption,
      state.resources.food,
      foodTick.spoiled,
      foodTick.net,
      foodTicksRemaining(state),
      forecastFoodReserve(state),
    ),
    // Water does not degrade and 1/tick per colonist is exact, so a linear
    // stock / deficit division IS the law here — no projection needed.
    water: summarize(
      "water",
      waterProduction,
      waterConsumption,
      state.resources.water,
      0,
      waterBalance,
      waterBalance < 0 ? Math.floor(state.resources.water / -waterBalance) : null,
    ),
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

  // The countdown, not the balance (Step067, tightened Step069): with
  // conservation a colony whose harvest matches its need still drains its
  // granary (measured: pop 19 with 19/tick empties in 46 ticks at a zero
  // balance), so the alert follows the law the tick applies. `netPerTick` is
  // that projection's own delta and the countdown walks the same law.
  if (summaries.food.ticksRemaining !== null && summaries.food.stock > 0) {
    const ticks = summaries.food.ticksRemaining ?? 0;
    alerts.push({
      severity: "warning",
      message: `Food: ${summaries.food.netPerTick}/tick · stock ${Math.floor(summaries.food.stock)} → ${ticks} ticks`,
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
  const servedWater = waterServed(
    state.resources.water,
    waterProductionPerTick(state),
    state.population,
  );
  if (state.population > 0 && servedWater < state.population) {
    alerts.push({
      severity: "warning",
      message: `Water: ${servedWater}/${state.population} colonists served`,
    });
  }

  // Hydric pressure (Step078 §6): the gauge only speaks from "tension" up —
  // an announcement every tick would train the player to ignore it. The level
  // is a band of the gauge, never a second reading of the coverage.
  // Step079: the gauge also states WHAT it costs. A consequence is printed only
  // while it is really happening (a bill with nobody thirsty is not a bill), and
  // the departure cadence is quoted only at the maximum — the numbers come from
  // the same helpers the tick and the panel use, so the copy cannot overstate.
  const pressureLevel = waterPressureLevel(state.waterPressure);
  if (pressureLevel !== "normal") {
    const bill = waterEmergencyCostPerTick(state);
    const clauses: string[] = [];
    if (bill > 0) clauses.push(`emergency water -${bill}/tick`);
    if (pressureLevel === "critical") {
      const away = ticksUntilWaterDeparture(state);
      clauses.push(
        away === null
          ? "population floor reached"
          : `1 colonist leaves every ${WATER_DEPARTURE_INTERVAL_TICKS} ticks (next in ${away})`,
      );
    }
    alerts.push({
      severity: pressureLevel === "tension" ? "info" : "warning",
      message: `Water pressure: ${state.waterPressure}/100 · ${pressureLevel}${clauses.length > 0 ? " · " + clauses.join(" · ") : ""}`,
    });
  }

  // Storage pressure (Step031, severity Step066): stock pinned at capacity
  // while the balance stays positive means production is not stored each
  // tick. This is INFORMATION, not a warning: since the market removal
  // (Step065) nothing sinks a surplus, so a full granary is a reachable
  // steady state of a colony that is otherwise fine — and every warning
  // turns the cockpit verdict `critical`, which read as a fault the player
  // could only clear by demolishing farms (2026-11-12 audit, F2). States
  // the state only — the fix (warehouse / fewer producers) is the player's
  // call.
  // Step067: the per-tick quantities of this loss (conservation vs storage
  // cap) live in the stats panel, which measures them; the alert only states
  // that the granary is at its cap. "not stored" was dropped because
  // conservation frees headroom every tick — production is partly replaced,
  // not systematically destroyed.
  const foodCap = foodCapacity(state);
  if (summaries.food.balancePerTick > 0 && state.resources.food >= foodCap) {
    alerts.push({
      severity: "info",
      message: `Food storage full (${Math.floor(state.resources.food)}/${foodCap})`,
    });
  }
  // A target the granary cannot hold is a capacity limit, not a production
  // deficit (Step069): saying "production" here would sell the player a farm
  // that only fills the cap faster. Information, never a warning.
  const reserve = summaries.food.reserve;
  if (reserve && reserve.capacityShort) {
    alerts.push({
      severity: "info",
      message: `Food reserve: target ${reserve.target} > capacity ${reserve.capacity}`,
    });
  }

  const waterCap = waterCapacity(state);
  if (summaries.water.balancePerTick > 0 && state.resources.water >= waterCap) {
    alerts.push({
      severity: "info",
      message: `Water storage full (${Math.floor(state.resources.water)}/${waterCap}) · +${summaries.water.balancePerTick}/tick not stored`,
    });
  }

  // The standing budget, stated before it bites (Step073): crowding made a big
  // colony able to spend more than it earns, so the alert no longer waits for
  // the treasury to reach 0. It reads the STANDING money model — taxes, the
  // trade floor of connected workshops, upkeep, the people — and deliberately
  // not the plank throughput bonus: that is a per-tick flow, measured as 0 at
  // rest (pop 24 read "commerce 12" one moment and "commerce 0" the next on
  // the same colony), and a countdown built on it would promise a collapse
  // that never comes. No countdown is quoted for the same reason: the line
  // states the standing deficit, and the treasury's own fall is the judge.
  const people = crowdingCostPerTick(state);
  const standingMoney =
    taxesPerTick(state) +
    commercePerTick(state) -
    maintenancePerTick(state) -
    people;
  if (standingMoney < 0) {
    const share = people > 0 ? ` (people -${people})` : "";
    if (state.resources.money === 0) {
      // the shared economy functions keep this honest with the simulation (Step028)
      alerts.push({
        severity: "warning",
        message: `Treasury: frozen at 0 · net ${standingMoney}/tick${share}`,
      });
    } else {
      alerts.push({
        severity: "info",
        message: `Budget: net ${standingMoney}/tick${share} before trade`,
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
  // quality, admission threshold, pollution — never an instruction. The gate
  // itself is the domain's (Step069 follow-up): the same reading feeds the
  // cockpit's `plan`, which therefore cannot offer unreachable headroom.
  if (
    admissionGate(state).blocked &&
    state.population < housingCapacity(state) &&
    state.resources.food > 0
  ) {
    alerts.push({
      severity: "warning",
      message: `Growth blocked: air quality ${Math.round(quality)} < admission threshold ${MIN_QUALITY_FOR_ADMISSION} (pollution ${Math.round(state.pollution)})`,
    });
  }

  // Air closing on a countdown (Step083): the gate above is reported once it
  // is SHUT, but the emission surplus that closes it is a standing fact and
  // the same forecast the cockpit's admission row shows. Without it, mothballing
  // the day-0 park to save 1/tick upkeep is a silent trap — net +2/tick and the
  // gate shuts ~37 ticks later, with no alert until then.
  const admissionBlocksIn = pollutionTicksToAdmissionBlock(state);
  if (admissionBlocksIn !== null && admissionBlocksIn > 0) {
    alerts.push({
      severity: "warning",
      message: `Environment: air closes admission in ${admissionBlocksIn} ticks (net +${pollutionFlows(state).net}/tick)`,
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
