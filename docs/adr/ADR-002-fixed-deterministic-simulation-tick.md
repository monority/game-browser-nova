# ADR-002 — Fixed Deterministic Simulation Tick

## Status

Accepted

## Context

The simulation must remain reproducible while rendering may run at variable frame rates.

## Decision

Simulation advances using a fixed tick independent from rendering.

Randomness must be seeded and explicit.

## Consequences

Positive:
- deterministic behavior;
- reproducible bugs;
- stable tests;
- rendering can vary independently.

Constraint:
- systems must not rely on frame rate for simulation behavior.

## Alternatives Considered

Frame-dependent simulation was rejected because it reduces determinism and makes behavior dependent on rendering performance.
