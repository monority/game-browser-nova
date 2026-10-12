# NOVA — Current Task

## Objective

Step011: analysis overlays (staffing tint on the grid; deposits mode) and
forecast drill-down (click a Food/Water row → contributing producers with
their state). No simulation rule changes.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (140/140; 8 new overlay/contributor tests)
- [x] `pnpm build` succeeds
- [x] E2E: 11/11 scenarios (overlays + drill-down added)

## Validation

- [x] Focused overlay tests → full suite → E2E → typecheck → lint → build,
      all executed 2026-10-09

## Status

- [x] Inspect / Implement / Test / Validate / Report

## Next decisions (not this step)

- Water-coverage per-network overlay (needs per-network water semantics).
- D3/D6 commerce re-anchoring (design decision).
- Starvation terminal state; storage caps (D5); environment; tech/ages.
