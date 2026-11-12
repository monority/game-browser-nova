import { expect, it } from "vitest";
import type { GameState } from "@/domain/simulation/state.js";
import { evaluateMilestones } from "@/domain/progression/progression.js";
import type { EventFrequency } from "@/domain/events/events.js";
import { playGame, SELFPLAY_CONFIG } from "./selfplay.governor.js";

/**
 * Step048 measurement harness (volet A). Replays the proven governor over
 * the events grid (off/rare/normal/frequent, same seed — plus a robustness
 * seed) with the age-3 pacing parameters and prints the metrics table plus
 * a JSON blob (test output, not a committed artifact). Same seed → same
 * curves, so the report numbers are reproducible.
 */

interface Sample {
  t: number;
  pop: number;
  money: number;
  food: number;
  water: number;
  age: number;
  staffed: number;
  buildings: number;
  pollution: number;
  events: string[];
}

interface RunMetrics {
  label: string;
  seed: string;
  events: false | EventFrequency;
  age2Tick: number | null;
  pop12Tick: number | null;
  finalTick: number;
  finalPop: number;
  finalMoney: number;
  finalAge: number;
  age2MilestonesDone: number;
  minMoneyAfter50: number | null;
  eventsDrawn: number;
  ticksWithActiveEvent: number;
  eventsByKind: Record<string, number>;
}

function runGrid(
  label: string,
  seed: string,
  events: false | EventFrequency,
): { metrics: RunMetrics; samples: Sample[] } {
  const config = { ...SELFPLAY_CONFIG, seed };
  const samples: Sample[] = [];
  let lastEventKinds = "";
  let ticksWithActiveEvent = 0;
  const byKind: Record<string, number> = {};
  const minMoney = { value: Infinity };

  const { state, phases } = playGame(
    -1,
    false,
    14,
    24,
    events,
    (s: GameState) => {
      const kinds = s.events.map((e) => e.kind).join("+");
      if (kinds !== lastEventKinds) {
        for (const kind of s.events.map((e) => e.kind)) {
          if (!lastEventKinds.split("+").includes(kind)) {
            byKind[kind] = (byKind[kind] ?? 0) + 1;
          }
        }
        lastEventKinds = kinds;
      }
      if (s.events.length > 0) ticksWithActiveEvent += 1;
      if (s.tick >= 50) minMoney.value = Math.min(minMoney.value, s.resources.money);
      const prev = samples[samples.length - 1];
      if (prev && s.population < prev.pop) {
        for (const h of samples.slice(-6)) {
          console.log(
            `[crash ${label}] t${h.t} pop${h.pop} money${h.money} food${h.food} water${h.water} bldgs${h.buildings} staffed${h.staffed} events[${h.events.join("+")}]`,
          );
        }
        console.log(`[crash ${label}] >>> t${s.tick} pop ${prev.pop}->${s.population} events[${kinds}]`);
      }
      if (s.tick % 5 === 0) {
        samples.push({
          t: s.tick,
          pop: s.population,
          money: Math.floor(s.resources.money),
          food: Math.floor(s.resources.food),
          water: Math.floor(s.resources.water),
          age: s.age,
          staffed: Object.values(s.buildings).filter((b) => b.staffed).length,
          buildings: Object.keys(s.buildings).length,
          pollution: s.pollution,
          events: s.events.map((e) => e.kind),
        });
      }
    },
    config,
  );

  const tickOf = (phase: string): number | null => {
    const hit = phases.find((p) => p.startsWith(phase + "@"));
    return hit ? Number(hit.split("@")[1]) : null;
  };

  return {
    metrics: {
      label,
      seed,
      events,
      age2Tick: tickOf("age2"),
      pop12Tick: tickOf("pop12"),
      finalTick: state.tick,
      finalPop: state.population,
      finalMoney: Math.floor(state.resources.money),
      finalAge: state.age,
      age2MilestonesDone: evaluateMilestones(state, 2).filter((m) => m.done).length,
      minMoneyAfter50: minMoney.value === Infinity ? null : Math.floor(minMoney.value),
      eventsDrawn: state.eventsDrawn,
      ticksWithActiveEvent,
      eventsByKind: byKind,
    },
    samples,
  };
}

it("Step048 volet A: events grid pacing measurement", () => {
  const runs: Array<{ metrics: RunMetrics; samples: Sample[] }> = [];
  for (const freq of [false, "rare", "normal", "frequent"] as const) {
    runs.push(runGrid(`selfplay/${String(freq)}`, SELFPLAY_CONFIG.seed, freq));
  }
  for (const freq of [false, "frequent"] as const) {
    runs.push(runGrid(`robustness/${String(freq)}`, "measure-2", freq));
  }

  const report = {
    note: "same seed -> same curves (ADR-007); params: playGame(-1, false, 14, 24)",
    runs: runs.map((r) => r.metrics),
  };
  console.log("Step048 report JSON:\n" + JSON.stringify(report));

  const header =
    "| run | age2@ | pop12@ | final t | pop | money | evDrawn | evTicks | byKind | minMoney>50 |\n" +
    "|---|---|---|---|---|---|---|---|---|---|\n";
  const rows = runs
    .map((r) => {
      const m = r.metrics;
      return `| ${m.label} | ${m.age2Tick} | ${m.pop12Tick} | ${m.finalTick} | ${m.finalPop} | ${m.finalMoney} | ${m.eventsDrawn} | ${m.ticksWithActiveEvent} | ${JSON.stringify(m.eventsByKind)} | ${m.minMoneyAfter50} |`;
    })
    .join("\n");
  console.log("Step048 measurement grid:\n" + header + rows);

  // sanity only — the numbers themselves are the deliverable
  const baseline = runs[0]!.metrics;
  expect(baseline.age2Tick).not.toBeNull();
  for (const r of runs) {
    expect(r.metrics.finalPop).toBeGreaterThan(0);
    expect(r.metrics.finalAge).toBeGreaterThanOrEqual(2);
  }
}, 600000);
