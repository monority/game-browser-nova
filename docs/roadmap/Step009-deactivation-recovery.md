# Step009 — Building Deactivation (Mothball) — D1 Recovery Mechanism

Baseline: `820955d` (Step008 follow-up). Implements **Option B** of the D1
analysis (user-approved): a mothball toggle that makes every zero-treasury
composition recoverable without free resources and without touching any
economic constant. **SAVE_VERSION 13 → 14.** Date: 2026-10-09.

## DECISIONS (user-approved)

- No reactivation fee; the delay and lost output are the cost.
- Inactive buildings: no maintenance, no production, no commerce, no
  housing, no staffing — relief lands at the next economy calculation;
  reactivation follows the normal tick (no same-tick exploit).
- The Colony Center can never be deactivated; roads unchanged.
- Persistence: SAVE_VERSION 14, v13→v14 migration defaults `active: true`.
- Economic constants unchanged; D3/D6 stay blocked; starvation's terminal
  state (pop 0 + food 0) stays out of scope as a separate future decision.

## IMPLEMENTATION

- `Building.active: boolean` (canonical, persisted) + `isActive()` =
  operational AND active — the filter used by every phase.
- `setBuildingActive(id, active)` command with `unknownBuilding` /
  `anchorProtected` validation; deactivation also clears `staffed`.
- Phase filters: maintenance (`operationalBuildingCount`), commerce
  (`connectedWorkshops`), housing (`housingCapacity`), staffing
  (`assignJobs`/`availableJobs`), production (food/water/wood/stone/planks).
- UI: inspection shows "· mothballed" and offers Mothball/Reactivate;
  panel re-renders after the toggle.
- `window.__nova.command()` added to the diagnostics surface (docs/
  DEBUGGING.md §3) for deterministic E2E driving.
- Reactivation is subject to the standard next-tick staffing contract: a
  reactivated workplace is re-staffed at the end of the reactivation tick
  and produces from the tick after.

## RECOVERY SCENARIOS VERIFIED (tests/deactivation.test.ts)

- **W > F (workshop-dense), money 0:** 2 residences + farm + 2 connected
  workshops + well frozen at 0 (net −1) → mothball the well → net =
  1 + 4 − 4 = **+1** → money accumulates (0 → +5 over 5 ticks) → reactivate
  → net 0, money and capital preserved. Growth genuinely restarts.
- **W = F, money 0:** mothball the well → net 0 → alive, no accumulation
  (boundary unchanged; full recovery needs the standing workshop density).
- Unlike removal, the capital (buildings, placement) is preserved — the
  crisis is survivable and *reversible*.

## HEALTHY-GROWTH EVIDENCE (new E2E)

Deterministic scenario (adaptive free-strip placement via the diagnostics
command surface, money/water injected as fixtures): 3 wells + 4 farms +
6 residences → population grows to exactly **5** (the MVP scale target's
lower bound), sustained food, no starvation. First end-to-end growth
measurement in the rebuild.

## VALIDATION (executed 2026-10-09)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 10 files / 122 tests (17 new), 0 failed; pre-existing 105 unmodified |
| G8 | `pnpm build` | PASS (chunk-size warning informational: three.js bundle) |
| G9 | `pnpm test:e2e` | PASS — 8/8 scenarios (2 new) |
| G10 | per-file diff review | PASS |

## RESULT

D1 Option B implemented: crises are prolonged but recoverable from any
composition, with no artificial free resources and no rebalancing. The
D1 product decision is thereby *resolved in implementation form*:
the pressure stays, recovery is player-controllable.

## DEFERRED / OUT OF SCOPE

- Starvation terminal state (pop 0 + food 0) — separate future decision.
- D3/D6 commerce re-anchoring (still blocked as a *design* task; the
  subsidy contract is untouched).
- Removal refunds (no-refund stands), storage caps (D5), environment,
  tech/ages.
