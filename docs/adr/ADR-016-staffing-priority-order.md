# ADR-016 — Keep the current staffing priority order

## Status

Accepted — 2026-11-18.

## Context

Staffing assigns one worker per eligible workplace (active, `jobCapacity > 0`,
road-adjacent). The order is farm (0) → well (1) → every other type (2), then the
canonical `y`, `x`, `id` cell order, with one exception from the validated water
law: at the grave hydric band (`waterPressure >= 75`, latch armed) `ceil(pop/2)`
wells are staffed before the farms.

The staffing **surface** did not read that order. It re-ranked workplaces by cell
alone and knew nothing of the hydric reserve. Two consequences were measurable:
a workshop on a lower row was reported "staffed" while the tick staffed the camp
on a higher one, and during a water crisis the panel reported the farms as staffed
and the wells as idle — the exact inverse of the phase. The idle cause itself was
already correct (`no-workers`); the rank and the staffed set attached to it were
not.

A Phase 0 question was separate: should extraction (camp, quarry) be ranked
before transformation (workshop), the way farms are ranked before wells?

## Decision

1. **One order, one assignment.** `staffingOrder` is the single home of the order
   and `staffingAssignment` the single greedy pass; `assignJobs` writes its result
   into `building.staffed`, and `getStaffingOverview` reads the same functions.
   The surface cannot disagree with the phase.
2. **The tail class keeps its cell order.** Extraction is NOT ranked before
   transformation inside class 2.

## Evidence

Reported from the 18 November 2026 session that shipped the change (`88900bc`,
`f654b25`); they were executed there and are not re-run for this record.

- two regression tests pin the two defects (`tests/staffing.test.ts`: "ranks by
  priority class, not by cell", "mirrors the hydric reserve"); a deliberate
  mutation back to cell ordering turns 3 tests red, including the new one;
- TypeScript: PASS; ESLint: PASS;
- Vitest: 31 files / 190 tests green (11.8 s);
- vacuity audit: 39 files / 205 declarations / 0 finding;
- scenarios: 6/6 (62.7 s);
- mutations: 5/5 caught (103.9 s);
- build: PASS (app 77.73 kB, 24.94 kB gzip);
- E2E of the inspection line: 1 passed (28.8 s);
- full E2E suite deliberately not run (milestone gate).

## Alternatives Considered

- **Extraction before transformation (strict).** Measured on the governed line
  (`playGame(-1, false, 240, 86)`, 1500 ticks): planks stock 27 against 1, but
  population 60 against 86.
- **Two conditional variants** ("only while the shops cannot be fed", "only while
  the yard cannot fund a single batch"): both land on the same 60, which points at
  the funding path rather than at the order.
- **The existing order**: the validated one, kept.

### Comparative measurements (t = 1 500)

| Measure | Current order | Extraction first |
|---|---:|---:|
| Planks in stock (original run) | 1 | 27 |
| Planks in stock (18/11 reconstruction) | 1 | 36 |
| Population | 86 | 60 |
| Age 2 ready | t=321 | t=321 |
| Age 3 milestones met by t≤1 500 | no | no |

The reconstruction (camp and quarry in class 2, workshop in class 3, run in a
throwaway worktree, since the original diff is not in Git) gives 36 instead of 27:
same direction, different value — it is not an exact copy of the rejected change.

Two claims from the first write-up are **withdrawn** here because the trace does
not support them:

- "Age 3 reached at t=321 in the baseline": false. t=321 is Age 2 becoming
  available in BOTH orders (`ready@321`, `age2@321`, `pop12@328`), and neither
  order satisfies the Age 3 milestones before t=1500 (the baseline ends at 32 food
  against an Age-3 gate of 75).
- "the camp holds the last worker, so the colony has nobody left": not observed.
  At the plateau the extraction-first run has **13 free workers**, no active camp,
  no staffed workshop, 121 food and air quality 55. Population stops at its housing
  capacity (60/60) because the treasury oscillates between 35 and 59, under the
  reference policy's build threshold, whose option list ranks farms, wells,
  warehouses and parks ahead of the residence.

## Consequences

- The surface tells the truth: the rank shown is the rank used, and the idle cause
  belongs to the building the phase actually leaves idle.
- The industrial problem must be solved by the **work capacity and the industrial
  margin**, not by reordering the queue: at 13 colonists, 12 of the 13 eligible
  posts are survival posts, and the chain lives on the single remaining worker.
- The camp is not mis-ranked: it yields 2 wood/tick against 2 wood per workshop,
  so one camp feeds one shop whatever the order.
- The record's cause for the 60-vs-86 difference is now the housing funding path,
  documented in `docs/rebalance/v0.1/DIAGNOSIS-POPULATION-PLATEAU.md`.

## Revisit Triggers

- A re-measurement on a policy that funds housing before the farm reserve, showing
  that extraction-first keeps growth while gaining planks.
- A decision to give the camp a higher yield, or to allow a partial wood batch,
  which would change the 2-vs-2 arithmetic this decision rests on.
- Any measured case where a free worker exists while a camp stays idle under the
  current order.

## Related

- `docs/rebalance/PHASE0-VERIFICATION-2026-11-18.md` §8 (measured follow-up)
- `docs/rebalance/v0.1/GAME-DESIGN-WORKFORCE.md` §10
- `docs/rebalance/v0.1/DIAGNOSIS-POPULATION-PLATEAU.md`
- [ADR index](./README.md)
