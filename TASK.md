# NOVA — Current Task

## Objective

Step008: removal commands (building + road cell) with Colony Center
protection, no refund, deterministic staffing recalculation, immediate
maintenance relief, cell reuse, and save v13 round-trip — MVP "removal"
scope plus freeze recovery.

## Scope

- Zero-money recovery probes: W = F stabilizes at net 0 (no accumulation);
  W > F (workshop-dense) fully recovers via removal — money accumulates,
  growth restarts (both verified in tests/removal.test.ts).
- No economic constants changed; D3/D6 stay blocked.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (105/105, 14 removal tests incl. the W > F
      recovery probe)
- [x] `pnpm build` succeeds
- [x] E2E: 6/6 Playwright scenarios (removal flow added)
- [x] STATE.md / Step008 report / roadmap pointer consistent with evidence

## Validation

- [x] Targeted removal tests → full suite → E2E → typecheck → lint → build,
      all executed 2026-10-09

## Status

- [x] Inspect
- [x] Implement
- [x] Test
- [x] Validate
- [x] Report

## Next decisions (not this step)

- D1: income/expense balance — sharpened by the recovery probes:
  workshop-dense money-0 colonies self-recover via removal; workshop-light
  ones stabilize at net ≤ 0 and still need a D1 decision (accept pressure /
  rebalance / wealth-free recovery).
- D3/D6 commerce re-anchoring — still blocked on D1.
