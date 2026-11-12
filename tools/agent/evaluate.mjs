#!/usr/bin/env node
/**
 * Unified evaluation (Step060): one command, both axes.
 *   1. headless simulation  — tools/agent/run.mjs plays a JSONL scenario
 *   2. browser probe        — tools/agent/observe.mjs boots the real app
 * and prints a single verdict, writing a markdown report next to the
 * screenshots.
 *
 * Usage: node tools/agent/evaluate.mjs [--ticks 60]
 *         [--script tools/agent/scenarios/opening.jsonl] [--json]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const scriptIndex = argv.indexOf("--script");
const script = scriptIndex >= 0 && argv[scriptIndex + 1] ? argv[scriptIndex + 1] : "tools/agent/scenarios/opening.jsonl";
const ticksIndex = argv.indexOf("--ticks");
const ticks = Math.max(1, Number(ticksIndex >= 0 ? argv[ticksIndex + 1] : "60") || 60);
const outDir = "playtest/artifacts/agent";

const simulation = spawnSync(
  process.execPath,
  ["tools/agent/run.mjs", "--json", "--quiet", "--script", script],
  { encoding: "utf8", env: process.env },
);

const verdicts = [];
const simErrors = [];
for (const line of (simulation.stdout ?? "").split("\n")) {
  if (line.trim().length === 0) continue;
  let reply;
  try {
    reply = JSON.parse(line);
  } catch {
    continue;
  }
  if (!reply.ok) simErrors.push(reply.error ?? "command rejected");
  const data = reply.data;
  if (data && typeof data === "object" && typeof data.verdict === "string") {
    verdicts.push(data);
  }
}

const observation = spawnSync(
  process.execPath,
  ["tools/agent/observe.mjs", "--json", "--ticks", String(ticks), "--out", outDir],
  { encoding: "utf8", env: process.env },
);
let probe = null;
for (const line of (observation.stdout ?? "").split("\n")) {
  if (!line.trim().startsWith("{")) continue;
  try {
    probe = JSON.parse(line);
  } catch {
    // keep the last parseable line
  }
}

const simOk = (simulation.status ?? 1) === 0 && simErrors.length === 0 && verdicts.length > 0;
const renderOk = Boolean(probe && probe.ok);
const ok = simOk && renderOk;

const lines = [];
lines.push(`NOVA evaluation — ${new Date().toISOString()}`);
lines.push("");
lines.push(`## Simulation (${script})`);
lines.push(`exit=${simulation.status} · assessments=${verdicts.length} · rejected commands=${simErrors.length}`);
for (const verdict of verdicts) {
  lines.push(
    `- t=${verdict.tick} age${verdict.age} **${verdict.verdict}** · pop ${verdict.population.value}/${verdict.population.housing} · money ${verdict.money.value} (net ${verdict.money.net}) · food ${verdict.food.stock} (${verdict.food.balance}) · water ${verdict.water.stock} (${verdict.water.balance}) · stagnant ${verdict.stagnantTicks}t`,
  );
  for (const reason of verdict.reasons) lines.push(`  - ${reason}`);
}
for (const error of simErrors.slice(0, 5)) lines.push(`- rejected: ${error}`);
lines.push("");
lines.push("## Rendering");
if (probe && probe.opening) {
  const { opening, later } = probe;
  lines.push(
    `exit=${observation.status} · canvas ${opening.canvas.width}x${opening.canvas.height} · drawCalls ${opening.perf.drawCalls} · geometries ${opening.perf.geometries} · avgUpdate ${opening.perf.avgUpdateMs.toFixed(2)}ms`,
  );
  if (opening.camera) {
    const c = opening.camera;
    lines.push(
      `camera radius ${c.radius.toFixed(1)} · phi ${c.phi.toFixed(3)} · theta ${c.theta.toFixed(3)} · target (${c.target.x.toFixed(1)}, ${c.target.z.toFixed(1)})`,
    );
  }
  lines.push(`tick 0 → ${opening.tick} · tick ${ticks} → ${later.tick} · pop ${later.stats.population}`);
  lines.push(`artifacts: ${probe.artifacts.join(", ")}`);
  for (const problem of probe.problems) lines.push(`- ${problem}`);
  for (const error of probe.consoleErrors.slice(0, 5)) lines.push(`- console: ${error}`);
} else {
  lines.push(`exit=${observation.status} · no probe output`);
  for (const line of (observation.stderr ?? "").split("\n").slice(-5)) if (line.trim()) lines.push(`- stderr: ${line}`);
}
lines.push("");
lines.push(`## Verdict: ${ok ? "PASS" : "FAIL"}`);
if (!simOk) lines.push(`- simulation axis failed`);
if (!renderOk) lines.push(`- rendering axis failed`);

const report = lines.join("\n");
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/evaluate.md`, report + "\n");

if (json) {
  console.log(JSON.stringify({ ok, verdicts, render: probe ? { ok: probe.ok, problems: probe.problems, consoleErrors: probe.consoleErrors, opening: probe.opening, later: probe.later } : null, report: `${outDir}/evaluate.md` }));
} else {
  console.log(report);
}
process.exitCode = ok ? 0 : 1;
