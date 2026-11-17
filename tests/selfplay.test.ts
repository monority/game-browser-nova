import { describe, expect, it } from "vitest";
import { applyCommand } from "@/domain/simulation/commands.js";
import { canAdvanceAge, evaluateMilestones, techLevel } from "@/domain/progression/progression.js";
import { TECH_DEFINITIONS } from "@/content/techs.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { parseSave, serialize } from "@/application/persistence/save.js";
import { waterServed } from "@/domain/water/water.js";
import { waterProductionPerTick } from "@/domain/production/production.js";
import { WATER_PRESSURE_GRAVE_THRESHOLD } from "@/domain/water/water.js";
import { mustOk } from "./helpers.js";
import { playGame, SELFPLAY_CONFIG, SELFPLAY_TICK_BUDGET } from "./selfplay.governor.js";

/**
 * Self-play verifier: gate assertions over the shared governor
 * (tests/selfplay.governor.ts) — see that module for the doctrine.
 */

describe("self-play verifier", () => {
  it("plays the full MVP loop to Age 2 with no intervention", () => {
    const { state, phases, traj } = playGame();
    for (const p of ["pop12", "ready", "age2", "save-mid"]) {
      expect(phases.some((x) => x.startsWith(p + "@")), "phase missing: " + p + " (reached: " + phases.join(", ") + ")").toBe(true);
    }
    expect(state.age).toBe(2);
    expect(evaluateMilestones(state, 2).length).toBe(4);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("selfplay phases: " + phases.join(", "));
    console.log("selfplay trajectory:\n" + traj.join("\n"));
  }, 180000);

  it("recovers from a money-zero crisis without injection", () => {
    // crisis lands mid-game (treasury 0 + food 8: the established Step009
    // scenario, no injection after setup); the run continues full-budget.
    const { state, phases } = playGame(300, false);
    expect(state.population).toBeGreaterThanOrEqual(10);
    expect(state.resources.money).toBeGreaterThanOrEqual(200);
    expect(phases.some((x) => x.startsWith("age2@"))).toBe(true);
    console.log("crisis phases: " + phases.join(", "));
  }, 180000);

  it("sustains growth beyond pop 12 with water holding (Step022)", () => {
    // Regression: growth follows housing construction; staffed well
    // capacity (wells ratio + cropRotation slack + mothball cycling)
    // keeps water in surplus. Fails if admission water-locks.
    const { state, phases } = playGame(-1, false, 24);
    expect(state.population).toBeGreaterThanOrEqual(20);
    expect(state.resources.water).toBeGreaterThan(0);
    expect(phases.some((x) => x.startsWith("pop12@"))).toBe(true);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("sustained phases: " + phases.join(", "));
  }, 180000);

  it("self-play with controlled events on still completes the MVP loop (Step047 guard)", () => {
    // The events garde-fou: frequent recurrence must not turn any viable
    // line non-viable (the Step001 trap precedent). Same phase gates as
    // the main run; events demonstrably fired; state stays lossless.
    const { state, phases } = playGame(-1, false, 14, undefined, "frequent");
    expect(state.eventsDrawn).toBeGreaterThanOrEqual(2);
    expect(state.population).toBeGreaterThan(0);
    for (const p of ["pop12", "ready", "age2"]) {
      expect(phases.some((x) => x.startsWith(p + "@")), "phase missing: " + p + " (reached: " + phases.join(", ") + ")").toBe(true);
    }
    expect(state.age).toBe(2);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("events-on phases: " + phases.join(", "));
  }, 240000);

  it("tuned events never collapse the robustness seed (Step049 guard)", () => {
    // Step048 finding: the harvest EXPIRY wiped a pop-24 colony on this
    // seed (frequent, pre-P1). P1 taper + P2 half floor + P3 interval
    // floor must keep the line viable — population only drops through
    // starvation (one colonist per unfed tick since Step055 option B), so
    // min pop >= the D2 founding 10 proves no famine ever fired.
    const config = { ...SELFPLAY_CONFIG, seed: "measure-2" };
    let minPop = Infinity;
    const { state, phases } = playGame(
      -1, false, 14, 24, "frequent",
      (s) => { minPop = Math.min(minPop, s.population); },
      config,
    );
    expect(state.eventsDrawn).toBeGreaterThanOrEqual(2);
    expect(minPop, "famine dip detected").toBeGreaterThanOrEqual(10);
    expect(state.population).toBeGreaterThanOrEqual(20);
    expect(state.resources.money).toBeGreaterThan(0);
    expect(phases.some((x) => x.startsWith("age2@")), "phases: " + phases.join(", ")).toBe(true);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("measure-2 tuned phases: " + phases.join(", "));
  }, 240000);

  it("keeps the wells running when the granary is short (Step084)", () => {
    // The food triage used to rest wells too, to free workers for the farms,
    // and it was harmless while a dry cistern only paused admission. Steps
    // 078-082 priced it (pressure, crisis bills, departures), so the same rule
    // was measured starving the colony: at t=1500 food 80 against a floor of
    // pop 53 x 2 = 106 rested all 29 wells, water production fell to 0,
    // pressure reached 100 and 53 colonists went unserved. The governor's
    // growing line must now end served at its ceiling instead — 86/86 with
    // production 86 and pressure 0 (2026-11-17). Asserted from the water law
    // itself, not from a rest flag, so any way of cutting the supply fails it.
    const { state } = playGame(-1, false, 240, 86);
    const production = waterProductionPerTick(state);
    expect(state.population).toBe(86);
    expect(waterServed(state.resources.water, production, state.population)).toBe(state.population);
    expect(state.waterPressure).toBeLessThan(WATER_PRESSURE_GRAVE_THRESHOLD);
  }, 240000);

  it("reaches Age 3 with a prosperous endgame (Step035)", () => {
    // Phased run: proven early path reaches Age 2, then growth opens to
    // cap 24. Directed tail (Step024 precedent) researches the two Age-2
    // techs once affordable, then advances through both gates with player
    // commands only.
    const { state, phases } = playGame(-1, false, 14, 24);
    expect(phases.some((x) => x.startsWith("age2@")), "no age 2: " + phases.join(", ")).toBe(true);
    // Step071: the automated player now researches as it can afford to, so
    // these two may already be in hand by the time the run gets here.
    // Step072: and the treasury is flat once the people cost something, so the
    // directed tail waits for the money it needs, the way a player would,
    // instead of assuming a pile that no longer exists.
    for (const techId of ["irrigation", "deepMining"]) {
      if (state.researchedTechs.includes(techId)) continue;
      for (let i = 0; i < 400 && state.resources.money < 160; i++) stepTicks(state, 1);
      mustOk(applyCommand(state, { kind: "researchTech", techId }));
    }
    const age2 = evaluateMilestones(state, 2);
    // `every` is vacuously true on an empty list: pin the four Age-2
    // dimensions (pop/bld/treasury/techs) before asking if all are met.
    expect(age2).toHaveLength(4);
    expect(age2.every((m) => m.done), "age-2 incomplete: " + JSON.stringify(age2)).toBe(true);
    mustOk(applyCommand(state, { kind: "advanceAge" }));
    expect(state.age).toBe(3);
    const age3 = evaluateMilestones(state, 3);
    // Step070 dropped the three-workshop gate: with farms and wells staffed
    // first, a workshop only opens when there are workers to spare.
    expect(age3.length).toBe(4);
    expect(age3.every((m) => m.done), "age-3 incomplete: " + JSON.stringify(age3)).toBe(true);
    expect(canAdvanceAge(state)).toBe(true);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("age3 phases: " + phases.join(", "));
  }, 240000);

  it("spends the whole endgame surplus on the Age-3 technologies (Step087)", () => {
    // The main line was read as a colony whose money has nowhere to go: at
    // t=1500 it holds 57 and the treasury grows +4.00/tick forever. Measured,
    // the surplus is not stranded, it is EARLY. The same colony, given a tick
    // budget instead of a run that ends, banks 350 at t=1574, takes its last
    // two Age-2 technologies, enters Age 3 at t=1575 with 207 left, and buys
    // cobbledRoads (800) at t=1761 and winterWheat (1200) at t=2061 — ending
    // with 1 money and every technology researched. The sink Step070 wrote
    // absorbs the whole surplus: what looked like a pile was the run stopping
    // 561 ticks before the last purchase.
    const { state } = playGame(-1, false, 240, 86);
    expect(state.tick).toBe(SELFPLAY_TICK_BUDGET);
    expect(state.age).toBe(2);

    const bought: string[] = [];
    for (let i = 0; i < 900; i++) {
      for (const [techId, def] of Object.entries(TECH_DEFINITIONS)) {
        if (def.age > state.age || state.researchedTechs.includes(techId)) continue;
        // The player keeps a building budget while it still builds, exactly
        // as the governor does; only the late-game purchases drop the buffer.
        const buffer = def.cost < 800 ? 200 : 0;
        if (state.resources.money < def.cost + buffer) continue;
        if (applyCommand(state, { kind: "researchTech", techId }).ok) bought.push(techId);
      }
      if (state.researchedTechs.includes("winterWheat") && state.researchedTechs.includes("cobbledRoads")) {
        break;
      }
      if (state.age < 3 && canAdvanceAge(state)) {
        mustOk(applyCommand(state, { kind: "advanceAge" }));
        continue;
      }
      stepTicks(state, 1);
    }

    expect(state.age).toBe(3);
    expect(bought).toContain("cobbledRoads");
    expect(bought).toContain("winterWheat");
    expect(state.researchedTechs).toHaveLength(8);
    // The point of the test: the surplus is GONE, not parked.
    expect(state.resources.money).toBeLessThan(100);
  }, 240000);

  it("spends the late-game treasury on the money-only technologies (Step086)", () => {
    // Step070 answered "the colony holds thousands and has nothing left to
    // buy" with two technologies priced in MONEY ALONE (cobbledRoads 800,
    // winterWheat 1200, both Age 3). Nothing asserted that answer until this
    // test: the sink was reachable in content but no run ever purchased it,
    // which is how the endgame treasury came to look like it had no well when
    // it had one behind a gate nobody opened.
    const { state } = playGame(-1, false, 14, 24);
    for (const techId of ["irrigation", "deepMining"]) {
      if (state.researchedTechs.includes(techId)) continue;
      for (let i = 0; i < 400 && state.resources.money < 160; i++) stepTicks(state, 1);
      mustOk(applyCommand(state, { kind: "researchTech", techId }));
    }
    mustOk(applyCommand(state, { kind: "advanceAge" }));
    expect(state.age).toBe(3);

    // The people cost money every tick: wait for the treasury the way a player
    // would rather than assuming a pile.
    for (let i = 0; i < 600 && state.resources.money < 1200; i++) stepTicks(state, 1);
    expect(state.resources.money).toBeGreaterThanOrEqual(1200);

    const moneyBefore = state.resources.money;
    const farmFoodBefore = techLevel(state, "farmFood");
    mustOk(applyCommand(state, { kind: "researchTech", techId: "winterWheat" }));
    expect(moneyBefore - state.resources.money).toBe(1200);
    expect(techLevel(state, "farmFood")).toBe(farmFoodBefore + 1);

    // Cobbled Roads is the same kind of purchase, one age gate closer in cost.
    const roads = applyCommand(state, { kind: "researchTech", techId: "cobbledRoads" });
    expect(roads.ok || roads.reason === "insufficientMoney", JSON.stringify(roads)).toBe(true);
  }, 240000);
});
