# NOVA — Current Task

## Objective

Step012: commerce re-anchoring (D3/D6) — commerce = 2/connected workshop
(base, unchanged) + 1 per plank actually produced (throughput bonus).
The subsidy is now a floor, not the engine.

## Notes

- Design derived then verified: pure staffed-anchoring would be
  structurally net ≤ 0 (breaks the D6 equilibrium invariant); the hybrid
  preserves every verified recovery path.
- Long-run: wood is finite; depletion falls back to the connection base
  (renewable wood = future decision).

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (142/142; 3 new bonus tests, 1 retargeted)
- [x] `pnpm build` succeeds
- [x] E2E: 11/11 scenarios

## Validation

- [x] Full battery executed 2026-10-09

## Status

- [x] Inspect / Design / Implement / Test / Validate / Report

## Next decisions (not this step)

- Renewable wood / tree regrowth (long-run economy boundary).
- Starvation terminal state; storage caps (D5); environment; tech/ages.
