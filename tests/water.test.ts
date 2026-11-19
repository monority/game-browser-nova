import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { saveToString } from "@/application/persistence/save.js";
import {
  WATER_PRESSURE_MAX,
  isSevereShortage,
  updateWaterPressure,
  waterBalancePerTick,
  waterCoverage,
  waterPressureGain,
  waterPressureLevel,
  waterServed,
  waterState,
} from "@/domain/water/water.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { techLevel } from "@/domain/progression/progression.js";
import { WATER_PER_WELL_PER_TICK, waterPerWell } from "@/domain/production/production.js";
import { waterWorkerReserve } from "@/domain/jobs/jobs.js";
import { stripToAnchor } from "./helpers.js";

/**
 * Step078 — the hydric gauge, on the tick's own integers. The boundaries are
 * read from whole served counts: 3/4 of 86 is 64.5, so the pair that matters
 * at pop 86 is 64 (74.42 %, severe) and 65 (75.58 %, light), never "75.00 %".
 */

const CONFIG = { seed: "water-test", width: 24, height: 24 };

/** Colony with no wells: the gauge can only see what the tick serves. */
function thirstyState(): GameState {
  const state = createInitialState(CONFIG);
  stripToAnchor(state);
  state.population = 10;
  state.resources.food = 100;
  state.resources.water = 0;
  return state;
}

describe("water coverage", () => {
  it("classifies the 75 % and 100 % boundaries from integer served counts", () => {
    // 100 % exactly.
    expect(waterState(10, 10)).toBe("balanced");
    expect(waterCoverage(10, 10)).toBe(1);
    // strictly below 100 %: growth is suspended, no accumulation.
    expect(waterState(99, 100)).toBe("light");
    expect(isSevereShortage(99, 100)).toBe(false);
    // 75 % exactly is light — the severe test is 4·served < 3·need.
    expect(waterState(75, 100)).toBe("light");
    expect(isSevereShortage(75, 100)).toBe(false);
    expect(waterPressureGain(75, 100)).toBe(0);
    // one colonist short of it is severe.
    expect(waterState(74, 100)).toBe("severe");
    expect(isSevereShortage(74, 100)).toBe(true);
    // the two measured cases of the design note, pop 86.
    expect(waterCoverage(64, 86)).toBeCloseTo(0.7442, 4);
    expect(waterState(64, 86)).toBe("severe");
    expect(waterCoverage(65, 86)).toBeCloseTo(0.7558, 4);
    expect(waterState(65, 86)).toBe("light");
  });
});

describe("water pressure", () => {
  it("rises proportionally to the shortage, with a floor of one point, capped and bounded", () => {
    // the boundary case is the slowest climb there is, but it does climb.
    expect(waterPressureGain(64, 86)).toBe(1);
    expect(waterPressureGain(43, 86)).toBe(1); // 50 %
    expect(waterPressureGain(21, 86)).toBe(3); // 24.4 %
    expect(waterPressureGain(0, 86)).toBe(4); // blackout
    // monotone: a worse shortage never gains less.
    expect(waterPressureGain(21, 86)).toBeGreaterThanOrEqual(waterPressureGain(43, 86));
    expect(waterPressureGain(0, 86)).toBeGreaterThanOrEqual(waterPressureGain(21, 86));
    // ceiling and floor hold even when the input is not bounded.
    expect(updateWaterPressure(99, 0, 86)).toBe(WATER_PRESSURE_MAX);
    expect(updateWaterPressure(WATER_PRESSURE_MAX, 0, 86)).toBe(WATER_PRESSURE_MAX);
    expect(updateWaterPressure(-5, 10, 10)).toBe(0);
    expect(updateWaterPressure(150, 10, 10)).toBe(WATER_PRESSURE_MAX - 1);
  });

  it("recovers one point per tick only at full coverage, and holds in a light deficit", () => {
    expect(updateWaterPressure(40, 10, 10)).toBe(39);
    expect(updateWaterPressure(40, 80, 100)).toBe(40); // 80 %: held
    expect(updateWaterPressure(40, 75, 100)).toBe(40); // 75 %: held
    expect(updateWaterPressure(40, 74, 100)).toBe(41); // severe: accumulates
    expect(updateWaterPressure(0, 10, 10)).toBe(0); // floored
    expect(updateWaterPressure(WATER_PRESSURE_MAX, 10, 10)).toBe(99); // never instant
  });

  it("names the gauge bands, which are not the coverage bands", () => {
    const bands = [0, 24, 25, 49, 50, 74, 75, 99, 100].map(waterPressureLevel);
    expect(bands).toEqual([
      "normal",
      "normal",
      "tension",
      "tension",
      "crisis",
      "crisis",
      "grave",
      "grave",
      "critical",
    ]);
  });

  it("handles the degenerate cases without dividing by zero", () => {
    // no need: nothing is missing, and the gauge clears.
    expect(waterCoverage(0, 0)).toBe(1);
    expect(waterState(0, 0)).toBe("balanced");
    expect(waterPressureGain(0, 0)).toBe(0);
    expect(updateWaterPressure(7, 0, 0)).toBe(6);
    // empty stock with production exactly equal to the need: balanced.
    expect(waterServed(0, 10, 10)).toBe(10);
    expect(waterState(waterServed(0, 10, 10), 10)).toBe("balanced");
    // a positive stock absorbs a production deficit: covered, balance negative.
    expect(waterServed(100, 64, 86)).toBe(86);
    expect(waterCoverage(86, 86)).toBe(1);
    expect(waterBalancePerTick(64, 86)).toBe(-22);
    // overproduction serves everybody and the balance is positive.
    expect(waterServed(0, 120, 86)).toBe(86);
    expect(waterBalancePerTick(120, 86)).toBe(34);
  });
});

describe("water pressure in the tick", () => {
  it("reads the tick's own served count and leaves consumption alone", () => {
    const dry = thirstyState();
    stepTicks(dry, 1);
    // no wells, empty stock: nothing served against ten thirsty colonists.
    expect(dry.waterPressure).toBe(4);
    expect(dry.resources.water).toBe(0);

    const funded = thirstyState();
    funded.resources.water = 60; // below the 80 cap, so nothing is clamped
    funded.waterPressure = 4; // a gauge left over from an earlier crisis
    stepTicks(funded, 1);
    // production 0, so the stock pays: ten served, not twenty (no double count).
    expect(funded.resources.water).toBe(50);
    expect(funded.waterPressure).toBe(3);
    // the gauge never starves the colony: food and population are untouched.
    expect(funded.population).toBe(10);
    // food follows its own law untouched: 100 +1 trickle −3 conservation −10 eaten.
    expect(funded.resources.food).toBe(88);
  });

  it("caps at 100 in a sustained blackout and is bit-identical across two runs", () => {
    const a = thirstyState();
    const b = thirstyState();
    stepTicks(a, 30);
    stepTicks(b, 30);
    expect(a.waterPressure).toBe(WATER_PRESSURE_MAX);
    expect(b.waterPressure).toBe(WATER_PRESSURE_MAX);
    expect(saveToString(a)).toBe(saveToString(b));
  });
});

describe("well productivity (option C, out of the shipped catalogue — D1)", () => {
  it("refuses to sell the third mouth per well while D2 and D4 are undecided", () => {
    // docs/rebalance/v0.1/decisions/D1-option-c.md, decided 2026-11-19: the
    // lever stays in the file (the measurements it produced must stay
    // reproducible) but the player is never offered it. The refusal lives in
    // the command, not only in the UI list, so a harness or a stale client
    // cannot buy what the catalogue no longer shows.
    const state = createInitialState(CONFIG);
    stripToAnchor(state);
    state.resources.money = 500;
    const refused = applyCommand(state, { kind: "researchTech", techId: "wellShafts" });
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "ok" : refused.reason).toBe("techNotAvailable");
    expect(state.researchedTechs).not.toContain("wellShafts");
    expect(state.resources.money).toBe(500); // nothing is deducted
    expect(waterPerWell(state)).toBe(WATER_PER_WELL_PER_TICK);
  });

  it("still reads the third mouth from a save that carries the lever", () => {
    // The arithmetic the option exists for: 10 colonists need 5 wells at
    // 2/tick and 4 at 3/tick, so the third mouth hands one post back to
    // industry. Measured the only way the lever can appear now — seeded the
    // way a loaded save carries it, since nothing can buy it.
    const state = createInitialState(CONFIG);
    stripToAnchor(state);
    state.researchedTechs.push("wellShafts");
    expect(techLevel(state, "wellWater")).toBe(1);
    expect(waterPerWell(state)).toBe(WATER_PER_WELL_PER_TICK + 1);
    expect(Math.ceil(10 / waterPerWell(state))).toBe(4);
    // Drought stays a flat removal, not a fraction: a shafted well goes 3 -> 2,
    // exactly as the plain well went 2 -> 1.
    state.events = [{ kind: "drought", ticksLeft: 9 }];
    expect(waterPerWell(state)).toBe(WATER_PER_WELL_PER_TICK);
  });
  // Step088: the grave-band reserve used to write the yield down as a 2, while
  // ordinaryWaterCapacity (same file) already read waterPerWell. One colony,
  // two hypotheses, the closed loop the project forbids. The reserve now reads
  // the law, so a shafted well serves three mouths and frees a post; drought
  // (a flat -1) puts the count back where it was.
  it("sizes the grave-band reserve from the yield, not from a written-down two", () => {
    const state = createInitialState(CONFIG);
    stripToAnchor(state);
    state.population = 12;
    state.waterReserveLatched = false;
    expect(waterWorkerReserve(state)).toBe(0); // not latched, no reserve
    state.waterReserveLatched = true;
    expect(waterWorkerReserve(state)).toBe(6); // ceil(12 / 2), the plain well
    state.researchedTechs.push("wellShafts");
    expect(waterWorkerReserve(state)).toBe(4); // ceil(12 / 3), the shafted well
    state.events = [{ kind: "drought", ticksLeft: 9 }];
    expect(waterWorkerReserve(state)).toBe(6); // 3 -> 2 under drought
  });
});
