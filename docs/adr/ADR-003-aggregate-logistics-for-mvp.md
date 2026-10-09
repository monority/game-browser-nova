# ADR-003 — Aggregate Logistics for MVP

## Status

Accepted

## Context

NOVA needs visible logistics without requiring expensive individual transport simulation in the MVP.

## Decision

MVP logistics use aggregate flows between production, storage, transport networks and consumers.

Visible vehicles represent the system without requiring one fully simulated agent per delivery.

## Consequences

Positive:
- lower CPU cost;
- deterministic behavior;
- simpler debugging;
- scalable MVP foundation.

Constraint:
- individual courier pathfinding is not part of MVP.

## Alternatives Considered

Full per-vehicle logistics was rejected for MVP because it adds complexity and cost before the gameplay value is proven.
