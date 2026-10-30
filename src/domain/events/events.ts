import type { GameState } from "@/domain/simulation/state.js";
import { createRng, hashString } from "@/domain/shared/rng.js";

/**
 * Controlled events (Step047, contract 01-PRODUCT-VISION §16): coherent
 * SYSTEM events that modify rates for a bounded duration — never
 * destruction, never direct treasury hits (design rules §21-22). Sandbox
 * default is OFF (design rule §24).
 *
 * Determinism (ADR-007): draws are a pure function of (world seed,
 * occurrence index) — independent of player actions. The same seed
 * replays the same event sequence at the same ticks; the self-play
 * determinism contract holds unchanged.
 *
 * Timing contract (mirrors staffing): resolveEvents runs as the LAST
 * phase of a tick (phase 11, canonical phase 12 of 05-SIMULATION §3).
 * Production and commerce phases read the ACTIVE events of the previous
 * resolution — an event spawning at tick T affects tick T+1 onward.
 * Enabling spawns the first event on the next resolution; the frequency
 * cursor then governs recurrence. Disabling clears active events
 * immediately (config off = no events, deterministically).
 */

export type EventKind = "drought" | "tradeClosure" | "bountifulHarvest";

export type EventFrequency = "rare" | "normal" | "frequent";

export interface ActiveEvent {
  kind: EventKind;
  ticksLeft: number;
}

export const EVENT_KINDS: readonly EventKind[] = [
  "drought",
  "tradeClosure",
  "bountifulHarvest",
];

export const EVENT_FREQUENCIES: readonly EventFrequency[] = [
  "rare",
  "normal",
  "frequent",
];

/** Every event lasts exactly this long (MVP: one intensity, fixed span). */
export const EVENT_DURATION_TICKS = 40;

/** Drought: each well loses this much output (2 → 1/tick). */
export const DROUGHT_WATER_REDUCTION_PER_WELL = 1;

/** Bountiful harvest: each farm gains this much yield (2 → 3/tick). */
export const HARVEST_FARM_BONUS_PER_TICK = 1;

/** Mean interval between events per frequency cursor (ticks). */
const FREQUENCY_INTERVALS: Record<EventFrequency, { min: number; max: number }> = {
  rare: { min: 800, max: 1200 },
  normal: { min: 400, max: 600 },
  frequent: { min: 150, max: 350 },
};

/** Distinct rng stream: world terrain uses 0x5e2d (world.ts). */
const EVENT_SEED_SALT = 0x5ee7;

/** Pure seeded draw: kind and next-interval from (seed, occurrence). */
export function drawEvent(
  seed: string,
  occurrence: number,
  frequency: EventFrequency,
): { kind: EventKind; interval: number } {
  const rng = createRng(hashString(seed) ^ EVENT_SEED_SALT ^ occurrence);
  const kind = EVENT_KINDS[Math.floor(rng() * EVENT_KINDS.length)] ?? "drought";
  const range = FREQUENCY_INTERVALS[frequency];
  const interval = range.min + Math.floor(rng() * (range.max - range.min + 1));
  return { kind, interval };
}

export function isEventActive(state: GameState, kind: EventKind): boolean {
  return state.events.some((event) => event.kind === kind);
}

/** Cycle order of the frequency cursor (UI): rare → normal → frequent → rare. */
export function nextEventFrequency(frequency: EventFrequency): EventFrequency {
  const index = EVENT_FREQUENCIES.indexOf(frequency);
  return EVENT_FREQUENCIES[(index + 1) % EVENT_FREQUENCIES.length] ?? "normal";
}

/**
 * Tick phase 11: expire active events, then draw the next one when due.
 * See the module timing contract — effects land from the NEXT tick's
 * production/commerce phases.
 */
export function resolveEvents(state: GameState): void {
  for (const event of state.events) event.ticksLeft -= 1;
  state.events = state.events.filter((event) => event.ticksLeft > 0);

  if (!state.eventsEnabled) return;
  if (state.tick < state.nextEventTick) return;

  const { kind, interval } = drawEvent(
    state.worldConfig.seed,
    state.eventsDrawn,
    state.eventFrequency,
  );
  state.eventsDrawn += 1;
  state.nextEventTick = state.tick + interval;
  state.events.push({ kind, ticksLeft: EVENT_DURATION_TICKS });
}
