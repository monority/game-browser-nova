import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand, type Command } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import { getColonyStats } from "@/application/queries/stats.js";
import { getAlerts, getResourceSummaries } from "@/application/queries/analysis.js";
import { getStaffingOverview } from "@/application/queries/staffing.js";
import { evaluateMilestones, canAdvanceAge } from "@/domain/progression/progression.js";
import { AGE_NAMES } from "@/content/progression.js";
import { BUILDING_DEFINITIONS, ROAD_MONEY_COST_PER_CELL, type BuildingType } from "@/content/buildings.js";
import { allRoadCells } from "@/domain/road/road.js";
import { cellKey } from "@/domain/shared/cells.js";
import { parseSaveString, saveToString } from "@/application/persistence/save.js";
import type { WorldConfig } from "@/domain/world/world.js";

/**
 * Headless agent play surface (Step058 tooling).
 *
 * Purpose: let an agent actually PLAY the shipped game and judge its state,
 * instead of writing throwaway specs. Every mutation goes through the real
 * command layer and the real tick pipeline — no rule is reimplemented here.
 * The reading side composes the app's own queries (stats, forecasts, alerts,
 * staffing, milestones) so the verdict cannot drift from the UI.
 *
 * Protocol: one JSON object per line on stdin (or --script file).
 *   {"cmd":"init","seed":"agent-1","width":24,"height":24}
 *   {"cmd":"tick","n":200}
 *   {"cmd":"build","type":"farm","x":3,"y":5,"road":true}
 *   {"cmd":"plan","buildings":[{"type":"residence","x":10,"y":3}]}
 *   {"cmd":"do","command":{"kind":"placeRoads","cells":["3,4"]}}
 *   {"cmd":"report"} | {"cmd":"assess"} | {"cmd":"map"}
 *   {"cmd":"state"} | {"cmd":"save","path":"x.json"} | {"cmd":"load","path":"x.json"}
 *   {"cmd":"help"} | {"cmd":"quit"}
 */

/** Mirrors DEFAULT_CONFIG in src/app/boot.ts: the agent plays the shipped game. */
const DEFAULT_CONFIG: WorldConfig = {
  seed: "nova-default",
  width: 24,
  height: 24,
  woodDeposits: [
    { x: 4, y: 4, amount: 60 },
    { x: 18, y: 6, amount: 40 },
  ],
  stoneDeposits: [{ x: 7, y: 18, amount: 50 }],
};

interface Runner {
  argv: string[];
  input: string;
  readFile(path: string): string;
  writeFile(path: string, text: string): void;
}

interface Sample {
  tick: number;
  pop: number;
  money: number;
  food: number;
  water: number;
}

interface Session {
  state: GameState;
  history: Sample[];
  json: boolean;
  quiet: boolean;
  window: number;
}

interface Reply {
  ok: boolean;
  text?: string;
  data?: unknown;
  error?: string;
}

const GLYPHS: Record<string, string> = {
  colonyCenter: "A",
  residence: "r",
  farm: "f",
  well: "w",
  workshop: "s",
  park: "p",
  warehouse: "h",
  lumberCamp: "c",
  quarry: "q",
};

const HELP = [
  "NOVA agent play — JSONL on stdin, one object per line.",
  "  {\"cmd\":\"init\",\"seed\":\"agent-1\",\"width\":24,\"height\":24,\"woodDeposits\":[{\"x\":4,\"y\":4,\"amount\":60}]}",
  "  {\"cmd\":\"tick\",\"n\":200}",
  "  {\"cmd\":\"build\",\"type\":\"farm\",\"x\":3,\"y\":5,\"road\":true}",
  "  {\"cmd\":\"plan\",\"buildings\":[{\"type\":\"residence\",\"x\":10,\"y\":3},{\"type\":\"farm\",\"x\":12,\"y\":3}]}",
  "  {\"cmd\":\"do\",\"command\":{\"kind\":\"setBuildingActive\",\"id\":\"building-3\",\"active\":false}}",
  "  {\"cmd\":\"report\"} | {\"cmd\":\"assess\"} | {\"cmd\":\"map\"} | {\"cmd\":\"state\"}",
  "  {\"cmd\":\"save\",\"path\":\"save.json\"} | {\"cmd\":\"load\",\"path\":\"save.json\"}",
  "  {\"cmd\":\"help\"} | {\"cmd\":\"quit\"}",
  "Flags: --json (one JSON reply per line) --quiet (report only on demand) --window N (stagnation window)",
].join("\n");

export async function run(io: Runner): Promise<number> {
  const json = io.argv.includes("--json");
  const quiet = io.argv.includes("--quiet");
  const windowFlag = io.argv.indexOf("--window");
  const windowValue = windowFlag >= 0 ? Number(io.argv[windowFlag + 1]) : 60;
  const session: Session = {
    state: createInitialState(DEFAULT_CONFIG),
    history: [],
    json,
    quiet,
    window: Number.isFinite(windowValue) && windowValue > 0 ? windowValue : 60,
  };
  session.history.push(sampleOf(session.state));

  const lines = io.input.split(/\r?\n/);
  if (io.input.trim().length === 0) {
    emit(session, { ok: true, text: HELP });
    return 0;
  }

  let failures = 0;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? "";
    if (raw.trim().length === 0 || raw.trim().startsWith("#")) continue;
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch (error) {
      failures += 1;
      emit(session, { ok: false, error: `invalid JSON on line ${index + 1}: ${String(error)}` });
      if (json) console.log(JSON.stringify({ line: index + 1, ok: false, error: "invalid JSON" }));
      continue;
    }
    if (typeof message !== "object" || message === null) {
      failures += 1;
      emit(session, { ok: false, error: `line ${index + 1}: expected an object` });
      continue;
    }
    const reply = await handle(session, message as Record<string, unknown>, io);
    if (!reply.ok) failures += 1;
    emit(session, reply);
    if ((message as Record<string, unknown>).cmd === "quit") break;
  }
  return failures > 0 ? 1 : 0;
}

function emit(session: Session, reply: Reply): void {
  if (session.json) {
    console.log(JSON.stringify(reply));
    return;
  }
  if (reply.text !== undefined) {
    console.log(reply.text);
    return;
  }
  if (reply.data !== undefined) {
    console.log(JSON.stringify(reply.data, null, 2));
    return;
  }
  if (!reply.ok) console.log("error: " + (reply.error ?? "unknown"));
}

async function handle(
  session: Session,
  message: Record<string, unknown>,
  io: Runner,
): Promise<Reply> {
  const kind = message.cmd;
  switch (kind) {
    case "init": {
      session.state = createInitialState(worldConfigFrom(message));
      session.history = [sampleOf(session.state)];
      return { ok: true, text: formatReport(session) };
    }
    case "tick": {
      const n = Math.max(1, Math.min(5000, Math.floor(asNumber(message.n, 1))));
      stepTicks(session.state, n);
      session.history.push(sampleOf(session.state));
      return { ok: true, text: session.quiet ? `t=${session.state.tick}` : formatReport(session) };
    }
    case "do": {
      const command = message.command;
      if (typeof command !== "object" || command === null) {
        return { ok: false, error: "do needs a `command` object" };
      }
      const result = applyCommand(session.state, command as Command);
      return result.ok
        ? { ok: true, text: `ok · t=${session.state.tick}`, data: result }
        : { ok: false, error: result.reason, data: result };
    }
    case "build":
      return build(session, message);
    case "plan":
      return plan(session, message);
    case "report":
      return { ok: true, text: formatReport(session) };
    case "assess":
      return { ok: true, text: formatAssessment(session), data: assess(session) };
    case "map":
      return { ok: true, text: formatMap(session.state) };
    case "state":
      return { ok: true, data: session.state };
    case "save": {
      const path = message.path;
      if (typeof path !== "string" || path.length === 0) return { ok: false, error: "save needs a path" };
      try {
        io.writeFile(path, saveToString(session.state));
      } catch (error) {
        return { ok: false, error: `save failed: ${String(error)}` };
      }
      return { ok: true, text: `saved t=${session.state.tick} → ${path}` };
    }
    case "load": {
      const path = message.path;
      if (typeof path !== "string" || path.length === 0) return { ok: false, error: "load needs a path" };
      try {
        session.state = parseSaveString(io.readFile(path));
      } catch (error) {
        return { ok: false, error: `load rejected: ${String(error)}` };
      }
      session.history = [sampleOf(session.state)];
      return { ok: true, text: formatReport(session) };
    }
    case "help":
      return { ok: true, text: HELP };
    case "quit":
      return { ok: true, text: `bye · t=${session.state.tick}` };
    default:
      return { ok: false, error: `unknown cmd: ${String(kind)} (try {"cmd":"help"})` };
  }
}

function build(session: Session, message: Record<string, unknown>): Reply {
  const typeName = message.type;
  if (typeof typeName !== "string" || !(typeName in BUILDING_DEFINITIONS)) {
    return { ok: false, error: `unknown building type: ${String(typeName)}` };
  }
  const type = typeName as BuildingType;
  const x = Math.floor(asNumber(message.x, -1));
  const y = Math.floor(asNumber(message.y, -1));
  const wantRoad = message.road !== false;
  const state = session.state;
  const notes: string[] = [];

  if (wantRoad) {
    const spot = neighbors(x, y).find((c) => isFree(state, c.x, c.y));
    if (!spot) return { ok: false, error: "no free neighbour for a road cell" };
    const road = applyCommand(state, { kind: "placeRoads", cells: [cellKey(spot.x, spot.y)] });
    if (!road.ok) return { ok: false, error: `road: ${road.reason}` };
    notes.push(`road ${spot.x},${spot.y}`);
  }
  const placed = applyCommand(state, { kind: "placeBuilding", type, x, y });
  if (!placed.ok) {
    return { ok: false, error: `building: ${placed.reason}`, text: `road-only (${notes.join(", ")}) · ${placed.reason}` };
  }
  const def = BUILDING_DEFINITIONS[type];
  notes.push(`${def.displayName} at ${x},${y} (−${def.moneyCost}$)`);
  return { ok: true, text: `ok · ${notes.join(" · ")}`, data: { type, x, y } };
}

/**
 * Dry-run a plan (Step061): the arithmetic the first real play test had to do
 * by hand — "how many residents does this economy actually sustain?".
 *
 * The hypothetical buildings are placed on a CLONE of the live state through
 * the real command layer (so cell/road rules are the game's), money/planks/
 * water are topped up on that clone because affordability is not the question
 * (the real bill is priced from the definitions and reported separately), and
 * the clone is ticked with the population pinned so admission cannot inflate
 * the answer. The reading then composes the same queries as the UI, so the
 * capacity it prints is the game's own view of the plan.
 */
const PLAN_TICKS = 4;

interface PlanPlacement {
  type: BuildingType;
  x: number;
  y: number;
  road: string | null;
}

function plan(session: Session, message: Record<string, unknown>): Reply {
  const entries = message.buildings;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: "plan needs `buildings`: [{\"type\":\"farm\",\"x\":3,\"y\":5}]" };
  }

  const clone: GameState = structuredClone(session.state);
  clone.resources.money = 1_000_000;
  clone.resources.planks = 1_000_000;
  clone.resources.water = 1_000_000;

  const placements: PlanPlacement[] = [];
  let cost = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: `plan entry #${index + 1}: expected an object` };
    }
    const spec = entry as Record<string, unknown>;
    const typeName = spec.type;
    if (typeof typeName !== "string" || !(typeName in BUILDING_DEFINITIONS)) {
      return { ok: false, error: `plan entry #${index + 1}: unknown building type: ${String(typeName)}` };
    }
    const type = typeName as BuildingType;
    const x = Math.floor(asNumber(spec.x, -1));
    const y = Math.floor(asNumber(spec.y, -1));
    const def = BUILDING_DEFINITIONS[type];
    cost += def.moneyCost;

    let road: string | null = null;
    if (spec.road !== false) {
      const spot = neighbors(x, y).find((c) => isFree(clone, c.x, c.y));
      if (!spot) return { ok: false, error: `plan entry #${index + 1}: no free neighbour for a road cell` };
      const roadResult = applyCommand(clone, { kind: "placeRoads", cells: [cellKey(spot.x, spot.y)] });
      if (!roadResult.ok) return { ok: false, error: `plan entry #${index + 1}: road: ${roadResult.reason}` };
      cost += ROAD_MONEY_COST_PER_CELL;
      road = cellKey(spot.x, spot.y);
    }

    const placed = applyCommand(clone, { kind: "placeBuilding", type, x, y });
    if (!placed.ok) {
      return { ok: false, error: `plan entry #${index + 1} (${type} ${x},${y}): ${placed.reason}` };
    }
    placements.push({ type, x, y, road });
  }

  // Construction is 2 ticks, staffing lands at the end of a tick, production
  // reads the assignment from the previous one: 4 ticks reach the steady state.
  const pinnedPopulation = session.state.population;
  const ticks = Math.max(1, Math.min(20, Math.floor(asNumber(message.ticks, PLAN_TICKS))));
  for (let i = 0; i < ticks; i++) {
    clone.population = pinnedPopulation;
    stepTicks(clone, 1);
  }
  clone.population = pinnedPopulation;

  const stats = getColonyStats(clone);
  const summaries = getResourceSummaries(clone);
  const staffing = getStaffingOverview(clone);
  // One resident eats 1 food and drinks 1 water per tick, so a production rate
  // IS a population count: the smallest of the three is the binding ceiling.
  const ceilings = [
    { name: "food", value: Math.floor(summaries.food.productionPerTick) },
    { name: "water", value: Math.floor(summaries.water.productionPerTick) },
    { name: "housing", value: stats.housingCapacity },
  ];
  const binding = ceilings.reduce((lowest, c) => (c.value < lowest.value ? c : lowest));
  const capacity = binding.value;
  const headroom = capacity - pinnedPopulation;
  const treasury = Math.floor(session.state.resources.money);
  const affordable = cost <= treasury;

  const placedText = placements
    .map((p) => `${p.type} ${p.x},${p.y}${p.road ? ` (road ${p.road})` : ""}`)
    .join(" · ");
  const text = [
    `plan +${placements.length} building(s) · cost ${cost}$ (${affordable ? "affordable" : `NOT affordable, short ${cost - treasury}$`} · treasury ${treasury}$) · projected t=${clone.tick}`,
    `  pop ${pinnedPopulation} (pinned) · housing ${stats.housingCapacity} · jobs ${staffing.staffed}/${staffing.eligible} staffed · no-road ${staffing.unconnected}`,
    `  food ${summaries.food.productionPerTick}/tick · water ${summaries.water.productionPerTick}/tick · money net ${signed(stats.netMoneyPerTick)}/tick · pollution ${Math.round(stats.pollution)} (q${stats.envQuality})`,
    `  capacity ${capacity} resident(s) (binding: ${binding.name}) · headroom ${headroom >= 0 ? "+" : ""}${headroom}`,
    `  placed: ${placedText}`,
  ].join("\n");

  return {
    ok: true,
    text,
    data: {
      cost,
      affordable,
      projectedTick: clone.tick,
      population: pinnedPopulation,
      capacity,
      binding: binding.name,
      headroom,
      housing: stats.housingCapacity,
      foodProductionPerTick: summaries.food.productionPerTick,
      waterProductionPerTick: summaries.water.productionPerTick,
      moneyNetPerTick: stats.netMoneyPerTick,
      jobs: { staffed: staffing.staffed, eligible: staffing.eligible, unconnected: staffing.unconnected },
      placements,
    },
  };
}

function worldConfigFrom(message: Record<string, unknown>): WorldConfig {
  const seed = typeof message.seed === "string" ? message.seed : DEFAULT_CONFIG.seed;
  const width = Math.floor(asNumber(message.width, DEFAULT_CONFIG.width));
  const height = Math.floor(asNumber(message.height, DEFAULT_CONFIG.height));
  return {
    seed,
    width,
    height,
    woodDeposits: depositList(message.woodDeposits) ?? [...(DEFAULT_CONFIG.woodDeposits ?? [])],
    stoneDeposits: depositList(message.stoneDeposits) ?? [...(DEFAULT_CONFIG.stoneDeposits ?? [])],
  };
}

function depositList(value: unknown): Array<{ x: number; y: number; amount: number }> | null {
  if (!Array.isArray(value)) return null;
  const out: Array<{ x: number; y: number; amount: number }> = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    out.push({
      x: Math.floor(asNumber(e.x, 0)),
      y: Math.floor(asNumber(e.y, 0)),
      amount: Math.floor(asNumber(e.amount, 0)),
    });
  }
  return out;
}

function isFree(state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.world.width || y >= state.world.height) return false;
  const key = cellKey(x, y);
  if (state.world.blockedCells[key]) return false;
  if (allRoadCells(state.roads).has(key)) return false;
  if (state.woodDeposits[key] || state.stoneDeposits[key]) return false;
  return !Object.values(state.buildings).some((b) => b.x === x && b.y === y);
}

function neighbors(x: number, y: number): Array<{ x: number; y: number }> {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ];
}

function sampleOf(state: GameState): Sample {
  return {
    tick: state.tick,
    pop: state.population,
    money: Math.floor(state.resources.money),
    food: Math.floor(state.resources.food),
    water: Math.floor(state.resources.water),
  };
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function depositTotals(deposits: GameState["woodDeposits"]): { remaining: number; capacity: number; cells: number } {
  let remaining = 0;
  let capacity = 0;
  const cells = Object.keys(deposits).length;
  for (const d of Object.values(deposits)) {
    remaining += d.remaining;
    capacity += d.capacity;
  }
  return { remaining, capacity, cells };
}

function countBuildings(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const b of Object.values(state.buildings)) {
    counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
  }
  return counts;
}

function composition(state: GameState): string {
  const counts = countBuildings(state);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, n]) => `${GLYPHS[type] ?? type[0] ?? "?"}${n}`)
    .join(" ");
}

function formatReport(session: Session): string {
  const state = session.state;
  const stats = getColonyStats(state);
  const summaries = getResourceSummaries(state);
  const alerts = getAlerts(state, summaries);
  const wood = depositTotals(state.woodDeposits);
  const stone = depositTotals(state.stoneDeposits);
  const ageName = AGE_NAMES[state.age] ?? `Age ${state.age}`;
  const lines: string[] = [
    `t=${state.tick} · age${state.age} ${ageName} · pop ${state.population}/${stats.housingCapacity} · money ${Math.floor(state.resources.money)} (net ${stats.netMoneyPerTick >= 0 ? "+" : ""}${stats.netMoneyPerTick}/tick) · bld ${Object.keys(state.buildings).length} (op ${stats.operationalBuildings})`,
    `food ${Math.floor(state.resources.food)}/${stats.foodCapacity} (${signed(summaries.food.balancePerTick)}/tick) · water ${Math.floor(state.resources.water)}/${stats.waterCapacity} (${signed(summaries.water.balancePerTick)}/tick) · wood ${Math.floor(state.resources.wood)} · stone ${Math.floor(state.resources.stone)} · planks ${Math.floor(state.resources.planks)}`,
    `workforce ${stats.staffedWorkplaces}/${stats.eligibleWorkplaces} · no-road ${getStaffingOverview(state).unconnected} · pollution ${Math.round(state.pollution)} (q${stats.envQuality}) · techs ${state.researchedTechs.length}${state.eventsEnabled ? ` · events ${state.eventFrequency}` : ""}`,
    `deposits: wood ${wood.remaining}/${wood.capacity} (${wood.cells} cells) · stone ${stone.remaining}/${stone.capacity} (${stone.cells} cells)`,
    `composition: ${composition(state) || "none"}`,
    `alerts: ${alerts.length === 0 ? "none" : ""}${alerts.length > 0 ? "\n" + alerts.map((a) => `  [${a.severity}] ${a.message}`).join("\n") : ""}`,
  ];
  return lines.join("\n");
}

function signed(value: number): string {
  return (value >= 0 ? "+" : "") + value;
}

interface Assessment {
  tick: number;
  age: number;
  ageName: string;
  verdict: "healthy" | "tight" | "critical";
  population: { value: number; housing: number; headroom: number };
  money: { value: number; net: number; ticksToZero: number | null };
  food: { stock: number; balance: number; ticksRemaining: number | null };
  water: { stock: number; balance: number; ticksRemaining: number | null };
  workforce: { workers: number; eligible: number; staffed: number; unconnected: number };
  pollution: { value: number; quality: number; net: number };
  storage: { foodPinned: boolean; waterPinned: boolean };
  alerts: Array<{ severity: string; message: string }>;
  pendingMilestones: Array<{ id: string; value: number; threshold: number }>;
  canAdvanceAge: boolean;
  stagnantTicks: number;
  /** Honest caveat: tick 0 has no staffing yet, so forecasts read as if unstaffed. */
  bootNote: string | null;
  reasons: string[];
  timeline: Sample[];
}

function assess(session: Session): Assessment {
  const state = session.state;
  const stats = getColonyStats(state);
  const summaries = getResourceSummaries(state);
  const alerts = getAlerts(state, summaries);
  const staffing = getStaffingOverview(state);
  const pending = evaluateMilestones(state, state.age)
    .filter((m) => !m.done)
    .map((m) => ({ id: m.id, value: m.value, threshold: m.threshold }));

  const moneyNet = stats.netMoneyPerTick;
  const money = Math.floor(state.resources.money);
  const ticksToZero = moneyNet < 0 ? Math.floor(money / -moneyNet) : null;
  const headroom = stats.housingCapacity - state.population;

  const stagnantTicks = ticksSincePopulationChange(session.history, state.tick);
  const reasons: string[] = [];

  const warnings = alerts.filter((a) => a.severity === "warning");
  for (const warning of warnings) reasons.push(warning.message);
  const survivalSqueeze =
    (summaries.food.ticksRemaining !== null && summaries.food.ticksRemaining <= 20) ||
    (summaries.water.ticksRemaining !== null && summaries.water.ticksRemaining <= 20);
  if (survivalSqueeze) reasons.push("stocks under 20 ticks");
  if (moneyNet < 0) reasons.push(`treasury net ${moneyNet}/tick`);
  if (staffing.unconnected > 0) reasons.push(`${staffing.unconnected} workplace(s) without road access`);
  if (headroom > 0 && stagnantTicks >= session.window) {
    reasons.push(`growth stalled ${stagnantTicks} ticks with ${headroom} housing headroom`);
  }

  const verdict: Assessment["verdict"] =
    warnings.length > 0 || survivalSqueeze || state.population === 0
      ? "critical"
      : moneyNet < 0 || staffing.unconnected > 0 || (headroom > 0 && stagnantTicks >= session.window)
        ? "tight"
        : "healthy";

  return {
    tick: state.tick,
    age: state.age,
    ageName: AGE_NAMES[state.age] ?? `Age ${state.age}`,
    verdict,
    population: { value: state.population, housing: stats.housingCapacity, headroom },
    money: { value: money, net: moneyNet, ticksToZero },
    food: {
      stock: Math.floor(summaries.food.stock),
      balance: summaries.food.balancePerTick,
      ticksRemaining: summaries.food.ticksRemaining,
    },
    water: {
      stock: Math.floor(summaries.water.stock),
      balance: summaries.water.balancePerTick,
      ticksRemaining: summaries.water.ticksRemaining,
    },
    workforce: {
      workers: staffing.workers,
      eligible: staffing.eligible,
      staffed: staffing.staffed,
      unconnected: staffing.unconnected,
    },
    pollution: { value: Math.round(state.pollution), quality: stats.envQuality, net: stats.pollutionNetPerTick },
    storage: {
      foodPinned: summaries.food.balancePerTick > 0 && state.resources.food >= stats.foodCapacity,
      waterPinned: summaries.water.balancePerTick > 0 && state.resources.water >= stats.waterCapacity,
    },
    alerts: alerts.map((a) => ({ severity: a.severity, message: a.message })),
    pendingMilestones: pending,
    canAdvanceAge: canAdvanceAge(state),
    stagnantTicks,
    bootNote:
      state.tick === 0
        ? "tick 0: staffing is assigned at the end of tick 1, so production/forecasts read as unstaffed"
        : null,
    reasons,
    timeline: session.history.slice(-6),
  };
}

function ticksSincePopulationChange(history: Sample[], tick: number): number {
  const current = history[history.length - 1];
  if (!current) return 0;
  for (let i = history.length - 2; i >= 0; i--) {
    const sample = history[i];
    if (!sample) continue;
    if (sample.pop !== current.pop) return tick - sample.tick;
  }
  return tick;
}

function formatAssessment(session: Session): string {
  const a = assess(session);
  const lines: string[] = [
    `assess t=${a.tick} age${a.age} (${a.ageName}) verdict=${a.verdict.toUpperCase()}`,
    `  pop ${a.population.value}/${a.population.housing} (headroom ${a.population.headroom}) · money ${a.money.value} (net ${signed(a.money.net)}/tick${a.money.ticksToZero === null ? "" : `, zero in ${a.money.ticksToZero}`})`,
    `  food ${a.food.stock} ${signed(a.food.balance)}/tick${a.food.ticksRemaining === null ? "" : ` · ${a.food.ticksRemaining} ticks left`} · water ${a.water.stock} ${signed(a.water.balance)}/tick${a.water.ticksRemaining === null ? "" : ` · ${a.water.ticksRemaining} ticks left`}`,
    `  workforce ${a.workforce.staffed}/${a.workforce.eligible} · no-road ${a.workforce.unconnected} · pollution ${a.pollution.value} (q${a.pollution.quality}, net ${signed(a.pollution.net)})${a.storage.foodPinned ? " · food pinned" : ""}${a.storage.waterPinned ? " · water pinned" : ""}`,
    `  milestones pending: ${a.pendingMilestones.length === 0 ? "none" : a.pendingMilestones.map((m) => `${m.id} ${m.value}/${m.threshold}`).join(" · ")} · canAdvanceAge=${a.canAdvanceAge}`,
    `  stagnant ${a.stagnantTicks} ticks · timeline ${a.timeline.map((s) => `t${s.tick} pop${s.pop} $${s.money}`).join(" | ")}`,
    `  reasons: ${a.reasons.length === 0 ? "none" : "\n" + a.reasons.map((r) => `    - ${r}`).join("\n")}`,
  ];
  if (a.bootNote) lines.push(`  note: ${a.bootNote}`);
  return lines.join("\n");
}

function formatMap(state: GameState): string {
  const roads = allRoadCells(state.roads);
  const byCell = new Map<string, string>();
  for (const b of Object.values(state.buildings)) {
    byCell.set(cellKey(b.x, b.y), GLYPHS[b.type] ?? (b.type[0] ?? "?").toUpperCase());
  }
  const rows: string[] = [];
  const ruler =
    "    " +
    Array.from({ length: state.world.width }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : " ")).join("");
  rows.push(ruler);
  for (let y = 0; y < state.world.height; y++) {
    let row = "";
    for (let x = 0; x < state.world.width; x++) {
      const key = cellKey(x, y);
      const glyph = byCell.get(key);
      if (glyph) row += glyph;
      else if (roads.has(key)) row += "+";
      else if (state.woodDeposits[key] || state.stoneDeposits[key]) row += "#";
      else if (state.world.blockedCells[key]) row += "^";
      else row += ".";
    }
    rows.push(String(y).padStart(3, " ") + " " + row);
  }
  rows.push(`x=lane (column), y=row · A anchor · r residence · f farm · w well · s workshop · p park · h warehouse · c camp · q quarry · + road · # deposit · ^ terrain`);
  return rows.join("\n");
}
