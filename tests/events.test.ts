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

describe("events constants", () => {
  it("events last 40 ticks (single MVP intensity)", () => {
    expect(EVENT_DURATION_TICKS).toBe(40);
  });
});

describe("seeded draws (ADR-007)", () => {
  it("are a pure function of (seed, occurrence, frequency)", () => {
    const a = drawEvent(CONFIG.seed, 3, "normal");
    const b = drawEvent(CONFIG.seed, 3, "normal");
    expect(b).toEqual(a);
    expect(a.interval).toBeGreaterThanOrEqual(400);
    expect(a.interval).toBeLessThanOrEqual(600);
  });

  it("vary by occurrence and respect the frequency range", () => {
    const rare = drawEvent(CONFIG.seed, 0, "rare");
    expect(rare.interval).toBeGreaterThanOrEqual(800);
    expect(rare.interval).toBeLessThanOrEqual(1200);
    const frequent = drawEvent(CONFIG.seed, 0, "frequent");
    expect(frequent.interval).toBeGreaterThanOrEqual(300); // P3 floor (Step049)
    expect(frequent.interval).toBeLessThanOrEqual(350);
    const kinds = new Set<EventKind>();
    for (let i = 0; i < 24; i++) kinds.add(drawEvent(CONFIG.seed, i, "normal").kind);
    expect(kinds.size).toBe(3); // all three kinds occur across the sequence
  });
});

describe("scheduling (tick phase 11)", () => {
  it("does nothing while disabled (sandbox default)", () => {
    const state = freshState();
    expect(state.eventsEnabled).toBe(false);
    stepTicks(state, 50);
    expect(state.events).toEqual([]);
    expect(state.eventsDrawn).toBe(0);
  });

  it("spawns the first event on the next tick after enabling, then expires it", () => {
    const state = freshState();
    mustOk(applyCommand(state, { kind: "configureEvents", enabled: true, frequency: "frequent" }));
    stepTicks(state, 1);
    expect(state.events).toHaveLength(1);
    expect(state.eventsDrawn).toBe(1);
    // effects land the tick AFTER the spawn (same timing as staffing):
    // at spawn tick T the event is set but tick T's production already ran
    const spawnTick = state.tick;
    expect(spawnTick).toBe(1);
    // runs 40 effective ticks, then expires
    stepTicks(state, EVENT_DURATION_TICKS - 1);
    expect(state.events).toHaveLength(1);
    stepTicks(state, 1);
    expect(state.events).toEqual([]);
  });

  it("disabling clears active events and stops draws", () => {
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

  it("bountiful harvest pays a one-off granary windfall at spawn", () => {
    const state = freshState();
    state.eventsEnabled = true;
    state.eventFrequency = "normal";
    // pick the occurrence whose seeded draw is the harvest
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
    // the farm rate is untouched — no dependency can form (P1' Step049)
    expect(foodPerFarm(state)).toBe(2);
  });

  it("closed trade routes halve the workshop floor but keep the plank bonus", () => {
    const state = freshState();
    state.population = 8;
    state.resources.wood = 10;
    const planks = 2;
    const baseline = commercePerTick(state, planks);
    expect(baseline).toBeGreaterThan(planks); // floor + throughput
    activate(state, "tradeClosure");
    // P2 (Step049): half floor = 2 workshops × ceil(2/2) = 2, throughput kept
    expect(commercePerTick(state, planks)).toBe(planks + 2);
    expect(isEventActive(state, "tradeClosure")).toBe(true);
  });

  describe("P1 expiry taper", () => {
    it("applies the rate reduction every other tick during the final 8", () => {
      const state = freshState();
      state.events = [{ kind: "drought", ticksLeft: 9 }];
      expect(waterPerWell(state)).toBe(1); // full effect until 8 left
      state.events = [{ kind: "drought", ticksLeft: 8 }];
      expect(waterPerWell(state)).toBe(1); // even tick → reduction applies
      state.events = [{ kind: "drought", ticksLeft: 7 }];
      expect(waterPerWell(state)).toBe(2); // odd tick → skipped
      state.events = [{ kind: "drought", ticksLeft: 2 }];
      expect(waterPerWell(state)).toBe(1);
      state.events = [{ kind: "drought", ticksLeft: 1 }];
      expect(waterPerWell(state)).toBe(2);
    });
  });
});

describe("tick integration", () => {
  it("an event spawning at tick T feeds tick T+1 production", () => {
    const state = freshState();
    // frequent schedule: first event spawns at tick 1, feeding tick 2
    mustOk(applyCommand(state, { kind: "configureEvents", enabled: true, frequency: "frequent" }));
    const kind = state.events[0]?.kind; // none yet
    expect(kind).toBeUndefined();
    stepTicks(state, 1);
    const spawned: ActiveEvent | undefined = state.events[0];
    if (!spawned) throw new Error("expected an event at tick 1");
    const wells = Object.values(state.buildings).filter((b) => b.type === "well").length;
    const farms = Object.values(state.buildings).filter((b) => b.type === "farm").length;
    if (spawned.kind === "drought") {
      const before = state.resources.water;
      stepTicks(state, 1);
      const consumed = state.population;
      expect(state.resources.water).toBe(Math.max(0, before - consumed + wells));
    } else if (spawned.kind === "bountifulHarvest") {
      const before = state.resources.food;
      stepTicks(state, 1);
      const eaten = state.population;
      expect(state.resources.food).toBe(before + farms * 3 + 1 - eaten);
    }
  });
});

describe("alerts", () => {
  it("active events produce a state line with the remaining duration", () => {
    const state = freshState();
    activate(state, "drought", 23);
    const alerts = getAlerts(state);
    const line = alerts.find((a) => a.message.startsWith("Drought"));
    expect(line?.severity).toBe("warning");
    expect(line?.message).toContain("23 ticks left");
  });
});

describe("persistence (v18)", () => {
  it("exposes SAVE_VERSION 18 with the v13 migratable chain", () => {
    expect(SAVE_VERSION).toBe(18);
    expect(MIGRATABLE_SAVE_VERSION).toBe(13);
  });

  it("round-trips an active event and its config losslessly", () => {
    const state = freshState();
    activate(state, "tradeClosure", 17);
    state.eventsEnabled = true;
    state.eventFrequency = "frequent";
    state.eventsDrawn = 4;
    state.nextEventTick = 512;
    const restored = parseSave(serialize(state));
    expect(restored).toEqual(state);
  });

  it("migrates a v17 save: events default to off/none", () => {
    const state = freshState();
    const doc = serialize(state) as unknown as Record<string, unknown>;
    const v17 = { ...doc, formatVersion: 17 } as Record<string, unknown>;
    delete v17.events;
    delete v17.eventsEnabled;
    delete v17.eventFrequency;
    delete v17.eventsDrawn;
    delete v17.nextEventTick;
    const migrated = parseSave(v17);
    expect(migrated.events).toEqual([]);
    expect(migrated.eventsEnabled).toBe(false);
    expect(migrated.eventFrequency).toBe("normal");
    expect(migrated.eventsDrawn).toBe(0);
    expect(migrated.nextEventTick).toBe(0);
  });

  it("rejects unknown event kinds and non-positive ticks", () => {
    const state = freshState();
    const doc = serialize(state) as unknown as Record<string, unknown>;
    const corrupt = {
      ...doc,
      events: [{ kind: "earthquake", ticksLeft: 5 }],
    } as Record<string, unknown>;
    expect(() => parseSave(corrupt)).toThrow(SaveValidationError);
    const zero = {
      ...doc,
      events: [{ kind: "drought", ticksLeft: 0 }],
    } as Record<string, unknown>;
    expect(() => parseSave(zero)).toThrow(SaveValidationError);
  });
});

describe("resolveEvents unit", () => {
  it("decrements and expires without a draw when disabled", () => {
    const state = freshState();
    activate(state, "drought", 2);
    resolveEvents(state);
    expect(state.events[0]?.ticksLeft).toBe(1);
    resolveEvents(state);
    expect(state.events).toEqual([]);
  });
});
