#!/usr/bin/env node
// Scenario playtests: play the shipped game through its own cockpit and assert
// what the player is promised, not what a unit test happens to read.
//
//   node tools/agent/check-scenarios.mjs            # every scenario
//   node tools/agent/check-scenarios.mjs --only famine
//
// Each scenario is a JSONL script for `tools/agent/run.mjs` (the same runner the
// agent playtests use) plus assertions over the replies. The assertion list is
// deliberately narrow: a scenario that re-checks sim arithmetic belongs in
// `tests/`, while what is checked here is the loop a player actually feels —
// an idle colony holds, labour is the first ceiling, a famine is survivable or
// not, and a save resumes exactly.
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const onlyIndex = argv.indexOf("--only");
const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : null;

const RUNNER = "tools/agent/run.mjs";
const SAVE = join(tmpdir(), "nova-scenario-check.json");

/** Play a JSONL script; returns the parsed replies in order. */
function play(steps, label) {
  const script = join(tmpdir(), `nova-scenario-${process.pid}.jsonl`);
  writeFileSync(script, steps.map((step) => JSON.stringify(step)).join("\n") + "\n");
  const result = spawnSync(process.execPath, [RUNNER, "--json", "--quiet", "--script", script], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  rmSync(script, { force: true });
  if (result.status !== 0) {
    throw new Error(`${label}: the runner exited ${result.status}\n${result.stderr.slice(0, 800)}`);
  }
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}

const stateOf = (reply) => reply.data;

/** The full game state is the only reply that carries both maps. */
const lastState = (replies) => stateOf(replies.findLast((r) => r.data?.buildings && r.data?.resources));
const num = (state, ...path) => path.reduce((value, key) => value?.[key], state);

/** No resource, and no counter inside the population block, may go NaN or negative-but-finite. */
function numericFaults(state) {
  const faults = [];
  const walk = (value, path) => {
    if (typeof value === "number" && !Number.isFinite(value)) faults.push(path);
    else if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`);
    }
  };
  walk(state, "state");
  return faults;
}

function check(condition, message, notes) {
  if (!condition) notes.failures.push(message);
  return condition;
}

// --- Scenarios -------------------------------------------------------------

const scenarios = [];
const scenario = (name, steps, verify) => scenarios.push({ name, steps, verify });

/** An idle colony must hold: no starvation, no windfall, no phantom progress. */
scenario("idle-hold", (() => {
  const steps = [{ cmd: "init" }];
  for (const n of [20, 20, 20]) steps.push({ cmd: "tick", n });
  steps.push({ cmd: "state" }, { cmd: "assess" });
  return steps;
})(), (replies, notes) => {
  const state = lastState(replies);
  check(state.tick === 60, `60 ticks were asked for, the state reports ${state.tick}`, notes);
  check(state.population === 10, `the idle colony holds 10 colonists, measured ${state.population}`, notes);
  check(num(state, "resources", "food") > 0, "an idle colony never runs out of food", notes);
  check(num(state, "resources", "money") > 100, "an idle colony still earns, measured " + num(state, "resources", "money"), notes);
  check(state.age === 1, "an idle colony cannot leave Age 1 on its own", notes);
  check(notes.faults.length === 0, `no non-finite counter after 60 ticks (${notes.faults.join(", ")})`, notes);
});

/**
 * Labour is the first ceiling: a colony at its worker limit that adds a well
 * gains a building and no water, and the game says so (`staffed: false`).
 */
scenario("labour-ceiling", [
  { cmd: "init" },
  { cmd: "do", command: { kind: "placeRoads", cells: ["2,2", "4,2", "2,3"] } },
  { cmd: "do", command: { kind: "placeBuilding", type: "well", x: 3, y: 2 } },
  { cmd: "tick", n: 80 },
  { cmd: "state" },
], (replies, notes) => {
  const placed = replies[2];
  check(placed.ok === true, `the well was accepted at 3,2 (${placed.ok ? "ok" : placed.data?.reason})`, notes);
  const state = lastState(replies);
  const built = Object.values(state.buildings).find((b) => b.type === "well" && b.x === 3 && b.y === 2);
  check(Boolean(built), "the well is in the state", notes);
  if (!built) return;
  const jobs = Object.values(state.buildings).reduce((sum, b) => sum + (b.type === "residence" ? 0 : 1), 0);
  check(
    built.staffed === false || state.population >= jobs,
    `a well added at the worker ceiling stays unstaffed (staffed=${built.staffed}, pop ${state.population}, ~${jobs} job slots)`,
    notes,
  );
  notes.facts.push(`well at 3,2 staffed=${built.staffed} · water ${num(state, "resources", "water")} · pop ${state.population}`);
});

/**
 * The opening colony is a food-deficit start that a farm and a road repair;
 * this is the loop the first playtest had to prove by hand.
 */
scenario("farm-repairs-deficit", [
  { cmd: "init" },
  { cmd: "do", command: { kind: "placeRoads", cells: ["2,2"] } },
  { cmd: "do", command: { kind: "placeBuilding", type: "farm", x: 1, y: 2 } },
  { cmd: "tick", n: 40 },
  { cmd: "state" },
], (replies, notes) => {
  const state = lastState(replies);
  const farm = Object.values(state.buildings).find((b) => b.type === "farm" && b.x === 1 && b.y === 2);
  check(Boolean(farm), "the farm is in the state", notes);
  check(farm?.staffed === true, "the farm on a road is staffed and working", notes);
  check(num(state, "resources", "food") > 0, "the colony still has food after the build", notes);
  notes.facts.push(`farm staffed=${farm?.staffed} · food ${num(state, "resources", "food")} after 40 ticks`);
});

/** A famine must be survivable or fatal on purpose — never silent. */
// The ids are read from the shipped opening, so the scenario stays honest if the
// colony is retuned: only farms are removed.
scenario("famine", [{ cmd: "init" }, { cmd: "state" }], (replies, notes) => {
  const opening = stateOf(replies[1]);
  const farms = Object.values(opening.buildings).filter((b) => b.type === "farm");
  const steps = [
    { cmd: "init" },
    ...farms.map((farm) => ({ cmd: "do", command: { kind: "removeBuilding", id: farm.id } })),
    { cmd: "tick", n: 400 },
    { cmd: "state" },
  ];
  const played = play(steps, "famine");
  const removed = played.slice(1, 1 + farms.length).every((r) => r.ok === true);
  const state = lastState(played);
  check(removed, `all ${farms.length} farms were removed`, notes);
  check(state.population >= 0, `population never goes negative (measured ${state.population})`, notes);
  check(num(state, "resources", "food") >= 0, "food never goes negative", notes);
  check(numericFaults(state).length === 0, "no non-finite counter after 400 famine ticks", notes);
  notes.facts.push(`farms ${farms.length} · pop after 400 famine ticks ${state.population}/10 · food ${num(state, "resources", "food")}`);
});

/** A save resumes the same game: the same 40 ticks from the save and from live play must agree. */
scenario("save-resumes", [
  { cmd: "init" },
  { cmd: "tick", n: 150 },
  { cmd: "save", path: SAVE },
  { cmd: "tick", n: 40 },
  { cmd: "state" },
], (replies, notes) => {
  const saved = replies[2];
  check(saved.ok === true, `the save was written (${saved.text ?? saved.error})`, notes);
  const live = stateOf(replies[4]);
  const resumed = play([{ cmd: "load", path: SAVE }, { cmd: "tick", n: 40 }, { cmd: "state" }], "save-load");
  const loaded = resumed[0];
  check(loaded.ok === true, `the save was accepted (${loaded.text ?? loaded.error})`, notes);
  const replay = stateOf(resumed[2]);
  const identical = JSON.stringify(replay) === JSON.stringify(live);
  check(identical, "40 ticks from the save match 40 ticks from live play", notes);
  if (!identical) {
    const key = Object.keys(live).find((k) => JSON.stringify(live[k]) !== JSON.stringify(replay[k]));
    notes.facts.push(`first divergent field: ${key}`);
  }
  rmSync(SAVE, { force: true });
});

/** The same script twice is the same game twice — determinism is a product promise. */
scenario("determinism", [
  { cmd: "init" },
  { cmd: "do", command: { kind: "placeRoads", cells: ["2,2"] } },
  { cmd: "do", command: { kind: "placeBuilding", type: "farm", x: 1, y: 2 } },
  { cmd: "tick", n: 120 },
  { cmd: "state" },
], (replies, notes) => {
  const script = [
    { cmd: "init" },
    { cmd: "do", command: { kind: "placeRoads", cells: ["2,2"] } },
    { cmd: "do", command: { kind: "placeBuilding", type: "farm", x: 1, y: 2 } },
    { cmd: "tick", n: 120 },
    { cmd: "state" },
  ];
  const again = play(script, "determinism");
  const first = lastState(replies);
  const second = lastState(again);
  check(JSON.stringify(first) === JSON.stringify(second), "two identical scripts produce identical states", notes);
});

// --- Driver ----------------------------------------------------------------

const chosen = scenarios.filter((s) => !only || s.name === only);
if (chosen.length === 0) {
  console.error(`unknown scenario: ${only}`);
  process.exit(2);
}

let failed = 0;
const started = Date.now();
for (const { name, steps, verify } of chosen) {
  const notes = { failures: [], facts: [], faults: [] };
  let replies;
  try {
    replies = play(steps, name);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name} — ${String(error.message).split("\n")[0]}`);
    continue;
  }
  const last = replies.findLast((r) => r.data?.buildings && r.data?.resources);
  if (last?.data) notes.faults = numericFaults(last.data).slice(0, 3);
  verify(replies, notes);
  const ok = notes.failures.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  for (const fact of notes.facts) console.log(`     · ${fact}`);
  for (const failure of notes.failures) console.log(`     ✗ ${failure}`);
}
console.log(`\n${chosen.length - failed}/${chosen.length} scenarios · ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exit(failed > 0 ? 1 : 0);
