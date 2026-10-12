# NOVA — Current Task

## Objective

Step014: environment system (MVP Phase 7) — global pollution stock
(0–100), workshop/quarry emissions, park absorption, environmental
quality admission gate (≥ 25, bootstrap-exempt), SAVE_VERSION 15 with
v13→v14→v15 migration chain.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (154/154; 12 new environment tests)
- [x] `pnpm build` succeeds
- [x] E2E: 12/12 scenarios (parks keep air clean → removal degrades)

## Validation

- [x] Full battery executed 2026-10-12

## Status

- [x] Inspect / Implement / Test / Validate / Report

## Next decisions (not this step)

- Pollution effects beyond admission (QoL/mortality), per-cell pollution.
- Renewable wood (long-run economy boundary); D3 second step.
- Tech/Âge 1 (phase 8); starvation terminal state; storage caps (D5).
