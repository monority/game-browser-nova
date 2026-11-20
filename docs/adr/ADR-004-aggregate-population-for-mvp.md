# ADR-004 — Aggregate Population for MVP

## Status

Accepted

## Context

NOVA needs population, employment, needs and growth while keeping simulation affordable.

## Decision

Population is simulated primarily through aggregate cohorts/categories.

Visible inhabitants are representation, not the canonical simulation state.

## Consequences

Positive:
- predictable CPU cost;
- simpler simulation;
- easier deterministic testing.

Constraint:
- individual citizen simulation is not part of MVP.

## Alternatives Considered

Full individual simulation was rejected for MVP because it adds significant cost without being required to prove the core optimization loop.
