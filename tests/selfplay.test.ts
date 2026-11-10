import { describe, expect, it } from "vitest";
import { applyCommand } from "@/domain/simulation/commands.js";
import { canAdvanceAge, evaluateMilestones } from "@/domain/progression/progression.js";
import { parseSave, serialize } from "@/application/persistence/save.js";
import { mustOk } from "./helpers.js";
import { playGame, SELFPLAY_CONFIG } from "./selfplay.governor.js";

/**
 * Self-play verifier: gate assertions over the shared governor
 * (tests/selfplay.governor.ts) — see that module for the doctrine.
 */

describe("self-play verifier", () => {
  it("plays the full MVP loop to Age 2 with no intervention", () => {
    const { state, phases, traj } = playGame();
    for (const p of ["pop12", "ready", "age2", "market-built", "market-sale", "save-mid"]) {
      expect(phases.some((x) => x.startsWith(p + "@")), "phase missing: " + p + " (reached: " + phases.join(", ") + ")").toBe(true);
    }
    expect(state.age).toBe(2);
    expect(evaluateMilestones(state, 2).length).toBe(5);
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
    // No market (last param): its surplus drain is a confounder for a
    // growth+water measurement; market behavior is covered by the
    // market, main-loop and age-3 tests.
    const { state, phases } = playGame(-1, false, 24, undefined, false);
    expect(state.population).toBeGreaterThanOrEqual(20);
    expect(state.resources.water).toBeGreaterThan(0);
    expect(phases.some((x) => x.startsWith("pop12@"))).toBe(true);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("sustained phases: " + phases.join(", "));
  }, 180000);

  it("self-play is deterministic", () => {
    const a = playGame();
    const b = playGame();
    expect(b.state).toEqual(a.state);
    expect(b.phases).toEqual(a.phases);
  }, 240000);

  it("self-play with controlled events on still completes the MVP loop (Step047 guard)", () => {
    // The events garde-fou: frequent recurrence must not turn any viable
    // line non-viable (the Step001 trap precedent). Same phase gates as
    // the main run; events demonstrably fired; state stays lossless.
    const { state, phases } = playGame(-1, false, 14, undefined, true, "frequent");
    expect(state.eventsDrawn).toBeGreaterThanOrEqual(2);
    expect(state.population).toBeGreaterThan(0);
    for (const p of ["pop12", "ready", "age2", "market-built", "market-sale"]) {
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
      -1, false, 14, 24, true, "frequent",
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

  it("reaches Age 3 with a prosperous endgame (Step035)", () => {
    // Phased run: proven early path secures the market while planks
    // exist, then growth opens to cap 24. Directed tail (Step024
    // precedent) researches the two Age-2 techs once affordable, then
    // advances through both gates with player commands only.
    const { state, phases } = playGame(-1, false, 14, 24);
    expect(phases.some((x) => x.startsWith("market-sale@")), "no market: " + phases.join(", ")).toBe(true);
    for (const techId of ["irrigation", "deepMining"]) {
      mustOk(applyCommand(state, { kind: "researchTech", techId }));
    }
    const age2 = evaluateMilestones(state, 2);
    expect(age2.every((m) => m.done), "age-2 incomplete: " + JSON.stringify(age2)).toBe(true);
    mustOk(applyCommand(state, { kind: "advanceAge" }));
    expect(state.age).toBe(3);
    // Project-mode aftermath (Step021): the market project mothballed
    // workshops down to one, and nothing reactivates them — the comment
    // promises "caller reactivates shops after". The player move is
    // reactivation; milestones read `active` (not staffing), so this is
    // same-tick with zero economic drift.
    for (const b of Object.values(state.buildings)) {
      if (b.type === "workshop" && !b.active) {
        mustOk(applyCommand(state, { kind: "setBuildingActive", id: b.id, active: true }));
      }
    }
    const age3 = evaluateMilestones(state, 3);
    expect(age3.length).toBe(5);
    expect(age3.every((m) => m.done), "age-3 incomplete: " + JSON.stringify(age3)).toBe(true);
    expect(canAdvanceAge(state)).toBe(true);
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
    console.log("age3 phases: " + phases.join(", "));
  }, 240000);
});
