# ADR-006 — Versioned Persistence

## Status

Accepted

## Context

NOVA will evolve its simulation and data structures over time.

## Decision

Persisted saves must carry an explicit save version.

Changes to the persistence schema require a migration or an explicit incompatibility decision.

## Consequences

Positive:
- controlled evolution;
- explicit compatibility;
- safer future changes.

Constraint:
- persistence changes require version handling and validation.

## Alternatives Considered

Unversioned serialization was rejected because schema changes would become ambiguous and unsafe.
