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

## 3. Corrective (same step, follow-up commit)

Two defects found by the post-commit gate run:

1. **Missed batch edit**: `adjacentRemaining` (deposits.ts) was reported
   as removed but the original edit batch had failed atomically (wrong
   file targeting for edits 1–2 aborted the call). Removed for real;
   verified by `rg` zero references + gates.
2. **Boot-time palette race (real UI defect)**: `refreshStats()` only
   ran from the tick loop and UI callbacks — a game booted paused at
   tick 0 (the E2E setup pattern) showed the raw palette: Market
   *enabled* in Age 1 until the first tick. The Step025 staffing E2E
   had always depended on a pre-pause tick firing (loading-timing race);
   the Step028 bundle flip made it fail. Fix: one `refreshStats()` at
   the end of `boot()` — palette age gates, stats and progression are
   correct from the first frame. Verified: staffing E2E 3/3 repeat.

## 4. Validation (all executed 2026-10-14)

- `npx tsc --noEmit`: PASS. `npx eslint .`: PASS.
- `npx vitest run`: PASS — 17 files / 217 tests (218 − 1 dead-code test).
- `npx vite build`: PASS.
- `npx playwright test`: PASS — 15/15 (unchanged; the refactor is
  behavior-preserving and the suite proves it).

## 5. Remaining audit items (not done, recorded)

- ~35 over-exported symbols (used internally, exported unnecessarily) —
  cosmetic; un-exporting is mechanical but touches many files.
- `ui.ts` (637 lines, 5 responsibilities) split into panel components —
  medium refactor, needs its own slice.
- `serialize` passes live deposit references into the save document —
  defensive deep-copy is a one-liner when convenient.
- Product questions from the audit remain open: age-3 dead end,
  decorative bld milestones post-D2, all-or-nothing plank throughput,
  market forecast precision.
