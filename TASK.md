# NOVA — Current Task

## Objective

Step008: removal commands (building + road cell) with Colony Center
protection, no refund, deterministic staffing recalculation, immediate
maintenance relief, cell reuse, and save v13 round-trip — MVP "removal"
scope plus freeze recovery.

## Scope

- Zero-money recovery probe: removal STABILIZES the frozen colony
  (survives at net 0) but cannot restart growth — the growth deadlock
  remains and needs the D1 balance decision.
- No economic constants changed; D3/D6 stay blocked.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (104/104, 13 new removal tests)
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

- D1: income/expense balance — now sharper: removal makes the freeze
  survivable but money-0 colonies still cannot accumulate (net ≤ 0 best
  case 0). Options: accept pressure / rebalance / wealth-free recovery.
- D3/D6 commerce re-anchoring — still blocked on D1.
