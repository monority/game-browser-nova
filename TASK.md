# NOVA — Current Task

## Objective

Step009: building deactivation (mothball) — Option B of the D1 analysis.
Inactive buildings pay no maintenance and produce/house/employ/earn
nothing; reactivation follows the normal tick. SAVE_VERSION 14.

## Decisions

- No reactivation fee; delay + lost output are the cost.
- Colony Center never deactivatable; roads unchanged.
- Economic constants unchanged; D3/D6 stay blocked; starvation terminal
  state (pop 0 + food 0) documented as a separate future decision.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (122/122; 17 new deactivation tests; the
      pre-existing 105 unmodified)
- [x] `pnpm build` succeeds
- [x] E2E: 8/8 scenarios (deactivation flow + deterministic growth to
      5 inhabitants)
- [x] STATE.md / Step009 report / roadmap pointer consistent with evidence

## Validation

- [x] Focused deactivation tests → full suite → E2E → typecheck → lint →
      build, all executed 2026-10-09

## Status

- [x] Inspect / Implement / Test / Validate / Report

## Next decisions (not this step)

- D1 remainder: only measured tuning remains (e.g., commerce re-anchoring
  D3/D6 — still a design decision, untouched).
- Starvation terminal state (pop 0 + food 0): separate future decision.
- Storage caps (D5), environment/fertility, tech/ages.
