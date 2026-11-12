#!/usr/bin/env node
/**
 * Browser probe (Step060): boots the real app, lets it run, and reports the
 * facts the headless cockpit cannot see — canvas size, draw calls, camera
 * framing, console errors — plus PNG captures.
 *
 * Usage: node tools/agent/observe.mjs [--ticks 60] [--port 5288]
 *                                     [--out playtest/artifacts/agent] [--json]
 *
 * Needs a working Chromium: in the agent container set
 * LD_LIBRARY_PATH from the cached trixie libraries (…/nova-e2e/root).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const index = argv.indexOf("--" + name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
}
const json = argv.includes("--json");
const ticks = Math.max(1, Number(arg("ticks", "60")) || 60);
const port = Number(arg("port", "5288")) || 5288;
const outDir = arg("out", "playtest/artifacts/agent");
// IPv4 literal: Node resolves `localhost` to ::1 first, while Vite listens on 127.0.0.1.
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let serverLog = "";
// Bind explicitly: Vite's default `localhost` can land on ::1 only, which the
// IPv4 probe below would never reach.
const server = spawn("./node_modules/.bin/vite", ["--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => {
  serverLog += chunk;
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk;
});

let browser = null;
let report;
try {
  const ready = await waitForServer();
  if (!ready) throw new Error("dev server did not answer on " + base + "\n" + serverLog.slice(-800));

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(base, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__nova), null, { timeout: 20000 });

  mkdirSync(outDir, { recursive: true });
  const opening = await snapshot(page);
  await page.screenshot({ path: `${outDir}/tick-0.png` });

  // 8x shortens the wait to the requested tick (1x = 2 ticks/s).
  await page
    .getByRole("button", { name: "8x", exact: true })
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForFunction((target) => window.__nova.getState().tick >= target, ticks, {
    timeout: 60000,
  });
  const later = await snapshot(page);
  await page.screenshot({ path: `${outDir}/tick-${ticks}.png` });

  const problems = [];
  if (consoleErrors.length > 0) problems.push(`${consoleErrors.length} console error(s)`);
  if (!opening.canvas.width || !opening.canvas.height) problems.push("canvas has no size");
  if (opening.perf.drawCalls <= 0) problems.push("no draw calls (nothing rendered)");
  if (!opening.camera) problems.push("camera not exposed");

  report = {
    ok: problems.length === 0,
    problems,
    consoleErrors,
    opening,
    later,
    artifacts: [`${outDir}/tick-0.png`, `${outDir}/tick-${ticks}.png`],
    url: base,
  };
  writeFileSync(`${outDir}/observe.json`, JSON.stringify(report, null, 2));
} catch (error) {
  report = { ok: false, problems: [String(error)], consoleErrors: [], serverLog: serverLog.slice(-2000) };
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

if (json) {
  console.log(JSON.stringify(report));
} else {
  printReport(report);
}
process.exitCode = report.ok ? 0 : 1;

function printReport(value) {
  if (!value.opening) {
    console.log("observe: FAILED");
    for (const problem of value.problems) console.log("  - " + problem);
    return;
  }
  const { opening, later } = value;
  console.log(`observe: ${value.ok ? "PASS" : "FAIL"} · ${value.url}`);
  console.log(
    `  opening t=${opening.tick} · canvas ${opening.canvas.width}x${opening.canvas.height} · drawCalls ${opening.perf.drawCalls} · geometries ${opening.perf.geometries} · avgUpdate ${opening.perf.avgUpdateMs.toFixed(2)}ms`,
  );
  if (opening.camera) {
    const c = opening.camera;
    console.log(
      `  camera radius ${c.radius.toFixed(1)} phi ${c.phi.toFixed(3)} theta ${c.theta.toFixed(3)} fov ${c.fov} aspect ${c.aspect.toFixed(3)} · target (${c.target.x.toFixed(1)}, ${c.target.y.toFixed(1)}, ${c.target.z.toFixed(1)})`,
    );
  }
  console.log(
    `  later   t=${later.tick} · pop ${later.stats.population} · money ${Math.floor(later.stats.resources.money)} · drawCalls ${later.perf.drawCalls}`,
  );
  console.log(`  artifacts: ${value.artifacts.join(", ")}`);
  if (value.consoleErrors.length > 0) {
    console.log("  console errors:");
    for (const error of value.consoleErrors.slice(0, 10)) console.log("    - " + error);
  }
  for (const problem of value.problems) console.log("  - " + problem);
}

async function waitForServer(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return false;
}

function snapshot(page) {
  return page.evaluate(() => {
    const handle = window.__nova;
    if (!handle) throw new Error("__nova missing");
    const canvas = document.querySelector("#app canvas");
    const state = handle.getState();
    return {
      tick: state.tick,
      camera: handle.cameraView ? handle.cameraView() : null,
      perf: handle.perf(),
      overlay: handle.overlay(),
      canvas: { width: canvas ? canvas.clientWidth : 0, height: canvas ? canvas.clientHeight : 0 },
      stats: {
        population: state.population,
        resources: { ...state.resources },
        age: state.age,
        buildings: Object.keys(state.buildings).length,
        housingCapacity: handle.stats().housingCapacity,
        netMoneyPerTick: handle.stats().netMoneyPerTick,
      },
    };
  });
}
