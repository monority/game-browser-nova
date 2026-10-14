# Step028 — Audit Quick Wins (dead code + shared economy)

Baseline: `f9c5691` (Step027). Implements the two quick-win items from the
Step028 audit: dead-code removal and a single source of truth for the
money model. Behavior-preserving: the full suite (unchanged minus one
dead-code test) proves it.

## 1. Shared money model (drift risk eliminated)

`src/domain/economy/economy.ts` gains three pure functions, now the single
source of truth:

- `taxesPerTick(state)` — 1/inhabitant.
- `commercePerTick(state, planksProducedThisTick = 0)` — connection base
  (pop-gated) + tradeRoutes tech + plank throughput bonus.
- `maintenancePerTick(state)` — non-exempt operational buildings.

Consumers:
- `collectRevenue` (simulation): taxes + commerce from the shared functions.
- `payMaintenance` (simulation): `maintenancePerTick`.
- `getColonyStats` (UI view): all three rates; the old inline duplication
  ("Mirrors collectRevenue") is gone.
- `getAlerts` treasury-frozen alert (UI view): net computed from the
  shared functions — previously it ignored the tradeRoutes tech and plank
  bonus, so the alert could disagree with the stats panel; now consistent
  by construction.

## 2. Dead code removed (verified zero references)

- `deductStone`, `deductWater` (resource.ts) — no production callers;
  `deductWater`'s unit test tested dead code and was removed with it.
- `isOperational` (building.ts) — superseded by `isActive`.
- `adjacentRemaining` (deposits.ts) — superseded by `extractAdjacent`.
- `PROGRESSION_STARTING_AGE` (progression.ts) — alias re-export, unused.
- `INITIAL_FOOD` / `INITIAL_WATER` (resource.ts) — values never reached
  gameplay: `composeD2Colony` always overwrites food=60/water=40 at
  creation. `createInitialResourceStock` now sets an empty baseline with
  a comment pointing at the D2 composition.

## 3. Validation (all executed 2026-10-14)

- `npx tsc --noEmit`: PASS. `npx eslint .`: PASS.
- `npx vitest run`: PASS — 17 files / 217 tests (218 − 1 dead-code test).
- `npx vite build`: PASS.
- `npx playwright test`: PASS — 15/15 (unchanged; the refactor is
  behavior-preserving and the suite proves it).

## 4. Remaining audit items (not done, recorded)

- ~35 over-exported symbols (used internally, exported unnecessarily) —
  cosmetic; un-exporting is mechanical but touches many files.
- `ui.ts` (637 lines, 5 responsibilities) split into panel components —
  medium refactor, needs its own slice.
- `serialize` passes live deposit references into the save document —
  defensive deep-copy is a one-liner when convenient.
- Product questions from the audit remain open: age-3 dead end,
  decorative bld milestones post-D2, all-or-nothing plank throughput,
  market forecast precision.
