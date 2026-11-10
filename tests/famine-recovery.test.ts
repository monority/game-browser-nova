import { describe, expect, it } from "vitest";
import { cellKey } from "@/domain/shared/cells.js";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { getResourceSummaries } from "@/application/queries/analysis.js";
import { foodProductionPerTick } from "@/domain/production/production.js";
import { waterCapacity } from "@/domain/storage/storage.js";
import { adjacentFree, freeCell, mustOk } from "./helpers.js";

/**
 * Step054 scenario E — famine recovery (F13 option B), deterministic
 * companion of `playtest/famine-recovery.spec.ts`.
 *
 * The browser harness cannot sample one point per tick (the render loop
 * advances in bursts), so the authoritative numbers live here: the same
 * three scenarios, stepped tick by tick, with the countdown read from the
 * very function the UI displays (`getResourceSummaries`).
 *
 * Isolation: every pre-existing farm/well/workshop is mothballed so food
 * production is exactly `farms * 2 + 1` (Center trickle), and water is
 * refilled before the recovery phase so the water gate cannot confound the
 * food measurement (water is F12's subject).
 */

const CONFIG = { seed: "famine-e", width: 20, height: 20 };

interface Spec {
  id: string;
  title: string;
  pop: number;
  farms: number;
  wells: number;
  extraHousing: number;
  food: number;
  /** exact balance first, then lose one farm (Step048 expiry shape) */
  shock: boolean;
}

const SPECS: Spec[] = [
  {
    id: "E1",
    title: "déficit à pop 14 — 5 fermes, stock 20",
    pop: 14,
    farms: 5,
    wells: 3,
    extraHousing: 4,
    food: 20,
    shock: false,
  },
  {
    id: "E2",
    title: "déficit à pop 24 — 5 fermes, stock 30",
    pop: 24,
    farms: 5,
    wells: 3,
    extraHousing: 14,
    food: 30,
    shock: false,
  },
  {
    id: "E3",
    title: "choc d'expiration — pop 15 exactement nourrie, puis 1 ferme perdue",
    pop: 15,
    farms: 7,
    wells: 3,
    extraHousing: 5,
    food: 0,
    shock: true,
  },
];

function restFactories(state: GameState): void {
  for (const b of Object.values(state.buildings)) {
    if ((b.type === "farm" || b.type === "well" || b.type === "workshop") && b.active) {
      mustOk(applyCommand(state, { kind: "setBuildingActive", id: b.id, active: false }));
    }
  }
}

function build(state: GameState, type: "farm" | "well" | "residence", count: number): void {
  for (let i = 0; i < count; i++) {
    const spot = freeCell(state);
    if (type === "residence") {
      mustOk(applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }));
      continue;
    }
    const road = adjacentFree(state, spot.x, spot.y);
    mustOk(applyCommand(state, { kind: "placeRoads", cells: [cellKey(road.x, road.y)] }));
    mustOk(applyCommand(state, { kind: "placeBuilding", type, x: spot.x, y: spot.y }));
  }
  stepTicks(state, 2); // operational
}

interface Run {
  spec: Spec;
  countdown: number | null;
  balance: number;
  floor: number;
  dropTicks: number;
  recoveredPop: number;
  peakPop: number;
  recoveryProduction: number;
  recoveryStaffedFarms: number;
}

function run(spec: Spec): Run {
  const state = createInitialState(CONFIG);
  state.resources.money = 5000;
  restFactories(state);
  build(state, "farm", spec.farms);
  build(state, "well", spec.wells);
  build(state, "residence", spec.extraHousing);
  state.population = spec.pop;
  state.resources.food = spec.food;
  state.resources.water = 5000;

  // what the UI shows while paused, before a single tick of deficit
  const forecast = getResourceSummaries(state).food;

  if (spec.shock) {
    stepTicks(state, 3); // exact balance holds
    const farm = Object.values(state.buildings).find((b) => b.type === "farm" && b.active);
    mustOk(applyCommand(state, { kind: "setBuildingActive", id: farm!.id, active: false }));
  }

  let firstLossTick: number | null = null;
  let floor = state.population;
  let dropTicks = 0;
  for (let i = 0; i < 40; i++) {
    stepTicks(state, 1);
    if (state.population < spec.pop && firstLossTick === null) firstLossTick = state.tick;
    if (state.population < floor) {
      floor = state.population;
      if (firstLossTick !== null) dropTicks = state.tick - firstLossTick + 1;
    }
  }
  // the loss must have stopped on its own
  expect(state.population).toBe(floor);

  // player answer: wake every farm (food first, the rest of the economy after)
  for (const b of Object.values(state.buildings)) {
    if (b.type === "farm" && !b.active) {
      mustOk(applyCommand(state, { kind: "setBuildingActive", id: b.id, active: true }));
    }
  }
  // measure the equilibrium, not the first gain. Water is held at capacity
  // every tick so the water gate cannot stop the recovery we are measuring.
  let peakPop = state.population;
  for (let i = 0; i < 60; i++) {
    state.resources.water = waterCapacity(state);
    stepTicks(state, 1);
    if (state.population > peakPop) peakPop = state.population;
  }

  return {
    spec,
    countdown: forecast.ticksRemaining,
    balance: forecast.balancePerTick,
    floor,
    dropTicks,
    recoveredPop: state.population,
    peakPop,
    recoveryProduction: foodProductionPerTick(state),
    recoveryStaffedFarms: Object.values(state.buildings).filter((b) => b.type === "farm" && b.staffed)
      .length,
  };
}

describe("Step054 E — récupération après famine (option B)", () => {
  const results: Run[] = [];

  for (const spec of SPECS) {
    it(`${spec.id} — ${spec.title}`, () => {
      const result = run(spec);
      results.push(result);
      expect(result.floor, "colony wiped").toBeGreaterThan(0);
      expect(result.recoveredPop, "no recovery after the player answer").toBeGreaterThan(
        result.floor,
      );
    });
  }

  it("prints the measurement table", () => {
    const header =
      "| scénario | pop départ | production | conso | balance | compte à rebours | plancher | ticks de chute | prod. reprise | fermes staffées | pic reprise | équilibre reprise |\n" +
      "|---|---|---|---|---|---|---|---|---|---|---|---|\n";
    const rows = results
      .map(
        (r) =>
          `| ${r.spec.id} | ${r.spec.pop} | ${r.spec.farms * 2 + 1} | ${r.spec.pop} | ${r.balance} | ${
            r.countdown === null ? "équilibre exact" : r.countdown + " ticks"
          } | ${r.floor} | ${r.dropTicks} | ${r.recoveryProduction} | ${r.recoveryStaffedFarms} | ${r.peakPop} | ${r.recoveredPop} |`,
      )
      .join("\n");
    console.log("Step054 E measurement:\n" + header + rows);
    expect(results).toHaveLength(SPECS.length);
  });
});
