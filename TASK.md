# NOVA — Current Task

## Objective

Step007: rebuild the implementation from the documented contract
(repository was reset to docs-only) through the Step006 slice —
money economy, deposits/extraction, Colony Center, Workshop
transformation (2 Wood → 1 Plank), Quarry gated on 5 Planks,
persistence v13, renderer, UI, E2E.

## Scope

- Fresh focused behavior suites (91 unit tests) instead of the pre-reset
  1908-test corpus.
- SAVE_VERSION 13 only — no legacy migration chain (no legacy saves).
- Documented simplifications: global water gate (not per-network), no
  StorageHub, no capability stages.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (91/91)
- [x] `pnpm build` succeeds
- [x] E2E: 5/5 Playwright scenarios (smoke, housing, commerce/plank gate,
      save/load, stat-surface contract)
- [x] STATE.md / Step007 report / roadmap pointer consistent with evidence
- [x] D1 documented + deferred (unchanged)

## Validation

- [x] Typecheck / lint / unit / build / E2E executed 2026-10-09

## Status

- [x] Inspect
- [x] Plan (P0–P11 slices, user-approved)
- [x] Implement
- [x] Test
- [x] Validate
- [x] Review
- [x] Report

## Next decisions (not this step)

- D1: income/expense balance (does a Workshop-carrying colony bleed by
  design?) — the standing next product decision.
- Commerce re-anchoring (D3/D6) — blocked on D1.
- Storage capacity activation (D5), demolish, environment/fertility,
  tech/ages.
