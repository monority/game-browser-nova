# Step006 — First Physical Transformation

Baseline: `ad3b4e2` (Step005 stone slice). Implements the first complete
physical transformation loop: **Workshop transforms Wood into Planks**.
Date: 2026-10-08.

## PRODUCT DECISION (§1, smallest product question)

The Workshop becomes the first transformation building — no new building
needed. The smallest coherent recipe: **2 Wood → 1 Plank per staffed
operational Workshop per tick** (all-or-nothing). Wood was chosen as the
input because it is the primitive recovery resource (guaranteed by the
Day-0 Colony Center anchor), so the transformation loop can never be
permanently locked.

## THE RECIPE (documented once, §2)

```text
2 Wood (colony stock)
        ↓ staffed operational Workshop (road-access per 09F staffing)
   1 Plank (colony stock) — per tick
```

- All-or-nothing: partial input produces nothing; inputs never negative.
- Unstaffed / non-operational Workshop produces nothing.
- Deterministic; no ex-nihilo generation; no generic recipe engine.

**Downstream use (§4, narrow)**: the **Quarry's construction now consumes
5 Planks** in addition to its money cost — exactly one building, mirroring
the existing `constructionWaterCost` pattern (concrete catalog property,
one-off atomic deduction, direct check in validation/affordability — no
same-tick revenue masking). This is deliberately narrow: it does not touch
recovery paths, Day-0, or any other construction contract.

## IMPLEMENTATION

- `resources.planks` added to the canonical stock (initial 0; planks only
  enter through the Workshop recipe).
- `producePlanks` tick phase 4e (after `produceStone`): counts staffed
  operational Workshops, requires the full wood batch
  (`workshops × 2`), deducts atomically, adds `workshops × 1` planks.
- Commerce is **UNCHANGED and separate**: the Step001 connection-based
  commerce contract (2/tick, staffing-independent) still applies to every
  operational connected Workshop. This physical/commerce separation is
  documented and temporary — re-anchoring is deferred (audit deferred work).
- `constructionPlankCost` added to `BuildingDefinition` (0 for every
  building; Quarry = 5), checked in `validatePlacement`
  (`insufficientPlanks`), `getPlacementAffordability` (direct check —
  planks are never masked by same-tick revenue, mirroring the Water rule),
  and deducted atomically in `applyCommand`.
- `deductWood` added to resource.ts (mirrors deductFood/deductWater).
- UI: hover feedback for `insufficientPlanks`; `stats.planks` exposed.
- Save: `SAVE_VERSION` 12 → **13**; `MIGRATABLE_SAVE_VERSION` 11 → 12;
  `migrateV12ToV13` adds `resources.planks: 0` (value-preserving).

## SELF-LOCK / RESOURCE INVARIANTS (tests/transformation.test.ts)

Normal staffed transformation (−2 wood/+1 plank), unstaffed → nothing,
missing/insufficient input → nothing (all-or-nothing), exact consumption
and output, determinism, full-tick integration, Quarry construction gated
on planks (placement + atomic deduction), Wood/Stone extraction and Colony
Center recovery unchanged, save migration v13 default.

## VALIDATION

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 124 files / 1908 tests (14 new + scripted fallout), 0 failed |
| G8 | `npm run build` | PASS |
| G9 | full E2E suite | 27/27 (crew passed on re-run after hover-race isolation; version pins 12→13 updated) |

Fallout was bookkeeping: version pins (12→13), catalog equality freezes
(+ `constructionPlankCost: 0`), resource-key arrays (+ `'planks'`), and
ResourceStock literals (+ `planks: 0`) — all scripted.

## DEFERRED

Commerce re-anchoring (documented separation), economy balancing (D1),
additional recipes/sinks, plank-dependent construction beyond the Quarry,
tech/ages, demolition, logistics.

## RESULT

First physical transformation loop complete:
extraction → transformation (2 Wood → 1 Plank) → narrow downstream
construction use, with the anti-self-lock recovery paths intact.
