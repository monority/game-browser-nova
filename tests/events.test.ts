import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  EVENT_DURATION_TICKS,
  drawEvent,
  isEventActive,
  nextEventFrequency,
  resolveEvents,
  type ActiveEvent,
  type EventKind,
} from "@/domain/events/events.js";
import {
  foodPerFarm,
  waterPerWell,
  waterProductionPerTick,
  produceWater,
  WATER_PER_WELL_PER_TICK,
} from "@/domain/production/production.js";
import { commercePerTick } from "@/domain/economy/economy.js";
import { getAlerts } from "@/application/queries/analysis.js";
import {
  parseSave,
  serialize,
  SAVE_VERSION,
  MIGRATABLE_SAVE_VERSION,
  SaveValidationError,
} from "@/application/persistence/save.js";
import { mustOk } from "./helpers.js";

const CONFIG = { seed: "events-test", width: 16, height: 16 };

function freshState(): GameState {
  return createInitialState(CONFIG);
}

function activate(state: GameState, kind: EventKind, ticksLeft = EVENT_DURATION_TICKS): void {
  state.events = [{ kind, ticksLeft }];
}

describe("seeded draws (ADR-007)", () => {
  it("are a pure function of (seed, occurrence, frequency) with one range per frequency", () => {
    expect(drawEvent(CONFIG.seed, 3, "normal")).toEqual(drawEvent(CONFIG.seed, 3, "normal"));
    const ranges: [Parameters<typeof drawEvent>[2], number, number][] = [
      ["rare", 800, 1200],
      ["normal", 400, 600],
      ["frequent", 300, 350], // P3 floor (Step049)
    ];
    for (const [frequency, min, max] of ranges) {
      const { interval } = drawEvent(CONFIG.seed, 0, frequency);
      expect(interval, frequency).toBeGreaterThanOrEqual(min);
      expect(interval, frequency).toBeLessThanOrEqual(max);
    }
    const kinds = new Set<EventKind>();
    for (let i = 0; i < 24; i++) kinds.add(drawEvent(CONFIG.seed, i, "normal").kind);
    expect(kinds.size).toBe(3); // all three kinds occur across the sequence
  });
});

describe("scheduling (tick phase 11)", () => {
  it("is inert while disabled (sandbox default)", () => {
    const state = freshState();
    expect(state.eventsEnabled).toBe(false);
    stepTicks(state, 50);
    expect(state.events).toEqual([]);
    expect(state.eventsDrawn).toBe(0);
  });

  it("spawns on the next tick after enabling, lasts 40 effective ticks, then expires", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "configureEvents", enabled: true, frequency: "frequent" }));
    stepTicks(state, 1);
    expect(state.events).toHaveLength(1);
    expect(state.eventsDrawn).toBe(1);
    expect(state.tick).toBe(1);
    stepTicks(state, EVENT_DURATION_TICKS - 1);
    expect(state.events).toHaveLength(1);
    stepTicks(state, 1);
    expect(state.events).toEqual([]);
  });

  it("clears active events and stops drawing when disabled", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "configureEvents", enabled: true, frequency: "frequent" }));
    stepTicks(state, 1);
    expect(state.events).toHaveLength(1);
    mustOk(applyCommand(state, { kind: "configureEvents", enabled: false, frequency: "frequent" }));
    expect(state.events).toEqual([]);
    const drawn = state.eventsDrawn;
    stepTicks(state, 30);
    expect(state.events).toEqual([]);
    expect(state.eventsDrawn).toBe(drawn);
  });

  it("cycles the frequency cursor rare → normal → frequent → rare", () => {
    expect(nextEventFrequency("rare")).toBe("normal");
    expect(nextEventFrequency("normal")).toBe("frequent");
    expect(nextEventFrequency("frequent")).toBe("rare");
  });

  it("decrements and expires without a draw when resolveEvents runs with events off", () => {
    const state = freshState();
    activate(state, "drought", 2);
    resolveEvents(state);
    expect(state.events[0]?.ticksLeft).toBe(1);
    resolveEvents(state);
    expect(state.events).toEqual([]);
  });

  it("is deterministic: same seed → same event sequence", () => {
    const a = freshState();
    const b = freshState();
    for (const state of [a, b]) {
      mustOk(applyCommand(state, { kind: "configureEvents", enabled: true, frequency: "normal" }));
    }
    stepTicks(a, 600);
    stepTicks(b, 600);
    expect(b.eventsDrawn).toBeGreaterThan(1);
    expect(a).toEqual(b);
  });
});

describe("effects (next-tick timing)", () => {
  it("drought halves each well", () => {
    const state = freshState();
    activate(state, "drought");
    expect(waterPerWell(state)).toBe(WATER_PER_WELL_PER_TICK - 1);
    state.buildings["b1"] = {
      id: "b1", type: "well", x: 1, y: 1,
      status: "operational", constructionTicksLeft: 0, staffed: true, active: true,
    };
    expect(waterProductionPerTick(state)).toBe(1);
    state.resources.water = 0;
    produceWater(state);
    expect(state.resources.water).toBe(1);
  });

  it("bountiful harvest pays a one-off granary windfall without touching the farm rate", () => {
    const state = freshState();
    state.eventsEnabled = true;
    state.eventFrequency = "normal";
    let occurrence = 0;
    while (drawEvent(CONFIG.seed, occurrence, "normal").kind !== "bountifulHarvest") {
      occurrence += 1;
    }
    state.eventsDrawn = occurrence;
    state.nextEventTick = 0;
    state.resources.food = 10;
    resolveEvents(state);
    expect(state.resources.food).toBe(50);
    expect(state.events[0]?.kind).toBe("bountifulHarvest");
    expect(foodPerFarm(state)).toBe(2); // no dependency can form (P1' Step049)
  });

  it("closed trade routes halve the workshop floor but keep the plank bonus", () => {
    const state = freshState();
    state.population = 8;
    state.resources.wood = 10;
    const planks = 2;
    expect(commercePerTick(state, planks)).toBeGreaterThan(planks); // floor + throughput
    activate(state, "tradeClosure");
    // P2 (Step049): half floor = 2 workshops × ceil(2/2) = 2, throughput kept
    expect(commercePerTick(state, planks)).toBe(planks + 2);
    expect(isEventActive(state, "tradeClosure")).toBe(true);
  });

  it("tapers the rate reduction every other tick during the final 8", () => {
    const state = freshState();
    const rateAt = (ticksLeft: number) => {
      state.events = [{ kind: "drought", ticksLeft }];
      return waterPerWell(state);
    };
    expect(rateAt(9)).toBe(1); // full effect until 8 left
    expect(rateAt(8)).toBe(1); // even tick → reduction applies
    expect(rateAt(7)).toBe(2); // odd tick → skipped
    expect(rateAt(2)).toBe(1);
    expect(rateAt(1)).toBe(2);
  });
});

describe("tick integration + alerts + persistence", () => {
  it("an event spawning at tick T feeds tick T+1 production", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "configureEvents", enabled: true, frequency: "frequent" }));
    expect(state.events[0]).toBeUndefined();
    stepTicks(state, 1);
    const spawned: ActiveEvent | undefined = state.events[0];
    if (!spawned) throw new Error("expected an event at tick 1");
    const wells = Object.values(state.buildings).filter((b) => b.type === "well").length;
    const farms = Object.values(state.buildings).filter((b) => b.type === "farm").length;
    if (spawned.kind === "drought") {
      const before = state.resources.water;
      stepTicks(state, 1);
      expect(state.resources.water).toBe(Math.max(0, before - state.population + wells));
    } else if (spawned.kind === "bountifulHarvest") {
      const before = state.resources.food;
      stepTicks(state, 1);
      expect(state.resources.food).toBe(before + farms * 3 + 1 - state.population);
    }
  });

  it("an active event shows one warning state line with its remaining duration", () => {
    const state = freshState();
    activate(state, "drought", 23);
    const line = getAlerts(state).find((a) => a.message.startsWith("Drought"));
    expect(line?.severity).toBe("warning");
    expect(line?.message).toContain("23 ticks left");
  });

  it("round-trips an active event, migrates v17 and rejects corrupt ones", () => {
    expect(SAVE_VERSION).toBe(18);
    expect(MIGRATABLE_SAVE_VERSION).toBe(13);

    const state = freshState();
    activate(state, "tradeClosure", 17);
    state.eventsEnabled = true;
    state.eventFrequency = "frequent";
    state.eventsDrawn = 4;
    state.nextEventTick = 512;
    expect(parseSave(serialize(state))).toEqual(state);

    const doc = serialize(freshState()) as unknown as Record<string, unknown>;
    const v17 = { ...doc, formatVersion: 17 } as Record<string, unknown>;
    for (const field of ["events", "eventsEnabled", "eventFrequency", "eventsDrawn", "nextEventTick"]) {
      delete v17[field];
    }
    const migrated = parseSave(v17);
    expect(migrated.events).toEqual([]);
    expect(migrated.eventsEnabled).toBe(false);
    expect(migrated.eventFrequency).toBe("normal");
    expect(migrated.eventsDrawn).toBe(0);
    expect(migrated.nextEventTick).toBe(0);

    for (const events of [[{ kind: "earthquake", ticksLeft: 5 }], [{ kind: "drought", ticksLeft: 0 }]]) {
      const corrupt = { ...doc, events } as Record<string, unknown>;
      expect(() => parseSave(corrupt), JSON.stringify(events)).toThrow(SaveValidationError);
    }
  });
});
