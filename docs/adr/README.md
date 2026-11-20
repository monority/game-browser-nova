# Architecture Decision Records

## Purpose

ADRs record durable technical decisions that future contributors should not have to rediscover.

## Decisions

- [ADR-001 — Simulation Independent from Rendering](./ADR-001-simulation-independent-from-rendering.md)
- [ADR-002 — Fixed Deterministic Simulation Tick](./ADR-002-fixed-deterministic-simulation-tick.md)
- [ADR-003 — Aggregate Logistics for MVP](./ADR-003-aggregate-logistics-for-mvp.md)
- [ADR-004 — Aggregate Population for MVP](./ADR-004-aggregate-population-for-mvp.md)
- [ADR-005 — Seeded World Generation](./ADR-005-seeded-world-generation.md)
- [ADR-006 — Versioned Persistence](./ADR-006-versioned-persistence.md)
- [ADR-007 — Seeded Controlled Events](./ADR-007-seeded-controlled-events.md)
- [ADR-015 — NOVA Vite + Vanilla DOM UI Deviation](./ADR-015-nova-vite-vanilla-dom-deviation.md)
- [ADR-016 — Keep the Current Staffing Priority Order](./ADR-016-staffing-priority-order.md)

## Create an ADR when

- a major architectural boundary changes;
- a technology is selected or rejected;
- persistence strategy changes;
- simulation architecture changes;
- performance architecture changes;
- a decision has meaningful long-term consequences.

Do not create an ADR for ordinary implementation details.

## Naming

    ADR-NNN-short-description.md

## Required Structure

```md
# ADR-NNN — Title

## Status

Accepted

## Context

What problem exists?

## Decision

What was chosen?

## Consequences

What becomes easier, harder, or constrained?

## Alternatives Considered

What reasonable alternatives were rejected and why?
```

Keep ADRs concise and factual.
