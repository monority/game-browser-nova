# ADR-005 — Seeded World Generation

## Status

Accepted

## Context

NOVA needs procedural worlds while remaining reproducible.

## Decision

World generation is deterministic from a seed and explicit generation parameters.

The same seed and parameters must produce the same world.

## Consequences

Positive:
- reproducible bugs;
- shareable scenarios;
- deterministic tests;
- stable generation.

Constraint:
- hidden external randomness must not influence generation.

## Alternatives Considered

Unseeded random generation was rejected because it prevents reliable reproduction and testing.
