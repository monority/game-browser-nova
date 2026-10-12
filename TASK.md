# NOVA — Current Task

## Objective

Step010: analysis surfaces (resource forecasts + state alerts) and UI
polish (inspection detail, hover tooltip, keyboard controls, speed-rate
bug fix). No simulation rule changes.

## Notes

- Speed bug fixed: 2×/4×/8× previously never changed the tick rate.
- Alerts follow the design rule: states and causes, never instructions.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (132/132; 10 new analysis tests)
- [x] `pnpm build` succeeds
- [x] E2E: 10/10 scenarios (forecast/alerts + keyboard added)

## Validation

- [x] Focused analysis tests → full suite → E2E → typecheck → lint →
      build, all executed 2026-10-09

## Status

- [x] Inspect / Implement / Test / Validate / Report

## Next decisions (not this step)

- Colored grid overlays + analysis center drill-down (next analysis layer).
- D3/D6 commerce re-anchoring (design decision).
- Starvation terminal state; storage caps (D5); environment; tech/ages.
