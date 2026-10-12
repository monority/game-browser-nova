# NOVA — Current Task

## Objective

Step013: visual identity & renderer polish — distinct building silhouettes,
atmospheric lighting/fog, terrain variation, UI color tokens + hover.
No simulation changes.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (142/142, suite unchanged)
- [x] `pnpm build` succeeds
- [x] E2E: 11/11 scenarios (smoke asserts zero console errors)
- [x] Visual browser inspection (panels + geometry, no errors)

## Validation

- [x] Full battery executed 2026-10-09

## Status

- [x] Inspect / Implement / Test / Validate / Report

## Next decisions (not this step)

- Shadows/LOD (profiling-gated), age visuals, per-resource coverage
  overlays, environment, tech/ages, starvation terminal state.
