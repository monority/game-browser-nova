# ADR-007 — Seeded controlled events

**Status:** ACCEPTED (2026-11-02, Step047)
**Deciders:** product owner (D1–D5 approval, docs/roadmap/Step046-events-decision.md)

## Context

Controlled events (01-PRODUCT-VISION §16) are the last Phase 10 deliverable.
They introduce chance into a simulation whose determinism is a tested
contract (ADR-002, ADR-005): same seed → identical trajectory, verified by
self-play and save-continuation tests.

## Decision

1. **Draws are a pure function of (world seed, occurrence index)** —
   `drawEvent(seed, occurrence, frequency)` on its own mulberry32 stream
   (`hashString(seed) ^ EVENT_SEED_SALT ^ occurrence`), independent of
   player actions and of tick timing. The same seed replays the same
   event sequence at the same ticks.
2. **Events are systemic rate modifiers with bounded duration** (D1):
   drought (wells 2→1/tick), closed trade routes (workshop commerce floor
   suspended, plank throughput kept), bountiful harvest (farms +1/tick) —
   40 ticks each, no destruction, no direct treasury effects.
3. **Active events and the draw counter persist** (D3): SAVE_VERSION 18,
   v17→v18 migration defaults to off/none (no event can predate the
   system).
4. **Config lives in GameState, not in UI preferences** (D4): a save
   loaded under any preferences keeps its event configuration, so the
   continuation-determinism contract holds. Sandbox default is OFF.
5. **Presentation is the existing alerts surface** (D5): states with
   remaining duration, never instructions, nothing modal. Rate functions
   stay the single source of truth, so forecasts/overlays remain exact.

## Consequences

- No randomness enters the conditional path; the self-play determinism
  test is unchanged and an events-on variant guards viability (Step047).
- Replayability: same seed + same commands → identical events (useful for
  bug reports and tests).
- Frequency cursor changes future draws only (persisted counter), never
  rewrites history.

## Alternatives considered

- **Per-game seed** for events: breaks the tested deterministic
  continuation and replay value; rejected.
- **Conditional (state-triggered) events** (e.g. smog at high pollution):
  coherent but a second trigger path; deferred beyond MVP.
- **Config in UiPreferences**: divergent replays of the same save;
  rejected.
