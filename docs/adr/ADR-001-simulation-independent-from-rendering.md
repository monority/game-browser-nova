# ADR-001 — Simulation Independent from Rendering

## Status

Accepted

## Context

NOVA requires deterministic simulation, testability and independent rendering.

## Decision

The simulation/domain layer must not depend on React, Three.js, DOM APIs or rendering lifecycle.

Rendering consumes simulation state.

## Consequences

Positive:
- deterministic tests;
- easier headless simulation;
- renderer can evolve independently;
- clearer architecture.

Constraint:
- rendering-specific behavior must not become a hidden source of simulation state.

## Alternatives Considered

Coupling simulation directly to scene objects was rejected because it increases coupling and makes deterministic testing harder.
