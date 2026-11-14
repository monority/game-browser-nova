import { describe, expect, it } from "vitest";
import { createInitialState, type GameState } from "@/domain/simulation/state.js";
import { applyCommand } from "@/domain/simulation/commands.js";
import { stepTicks } from "@/domain/simulation/tick.js";
import {
  EVENT_DURATION_TICKS,
  drawEvent,
  type ActiveEvent,
  type EventKind,
} from "@/domain/events/events.js";
import {
  waterPerWell,
  waterProductionPerTick,
  produceWater,
  WATER_PER_WELL_PER_TICK,
} from "@/domain/production/production.js";
import {
  parseSave,
  serialize,
  SAVE_VERSION,
  MIGRATABLE_SAVE_VERSION,
  SaveValidationError,
} from "@/application/persistence/save.js";
import { mustOk, stripToAnchor } from "./helpers.js";

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
    // Which kind this seed draws must not decide whether anything is asserted:
    // the branch that used to sit here compared two effects of which a
    // different seed would test neither, and passed. Each effect is pinned
    // deterministically — the harvest payout below as a literal, the drought
    // reduction in its own test above — so this line only pins the timing.
    expect(["drought", "bountifulHarvest"]).toContain(spawned.kind);

    // The harvest pays out ONCE at spawn (P1' Step049), 40 flat — not a rate
    // the colony can grow into. Deterministic: pick the (seed, occurrence)
    // that draws it instead of hoping a branch fires.
    const harvestAt = Array.from({ length: 64 }, (_, i) => i).find(
      (i) => drawEvent("harvest-probe", i, "normal").kind === "bountifulHarvest",
    );
    if (harvestAt === undefined) throw new Error("no harvest draw in 64 occurrences");
    const payout = freshState();
    stripToAnchor(payout);
    payout.population = 0; // no eaters: the delta is the payout plus the trickle
    payout.worldConfig.seed = "harvest-probe";
    payout.eventsEnabled = true;
    payout.eventsDrawn = harvestAt;
    payout.nextEventTick = payout.tick;
    payout.resources.food = 10; // well under the granary cap: the payout is not clipped
    const foodBefore = payout.resources.food;
    stepTicks(payout, 1);
    // literal on purpose: comparing to HARVEST_WINDFALL_FOOD would pass for
    // any value of the constant, which is exactly what this pins.
    expect(payout.resources.food).toBe(foodBefore + 40 + 1);
  });

  it("round-trips an active event, migrates v17 and rejects corrupt ones", () => {
    expect(SAVE_VERSION).toBe(19);
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
