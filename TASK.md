# NOVA — Task Pointer (archived Step015 content below)

> Current source of truth: `docs/STATE.md` (repository state) and
> `docs/roadmap/` (per-step reports, Step000–Step031). This file's
> Step015 task completed 2026-10-12; kept as pointer only.

---

# NOVA — Current Task (Step015, completed 2026-10-12)

## Objective

Step015: Colony Center food trickle (+1 food/tick, audit D4 completion) —
retires the last structural terminal state (pop 0 + food 0 + standing
residences). Low-rate by design: farms always out-produce it; growth still
requires housing + farms.

## Acceptance Criteria

- [x] `npx tsc --noEmit` clean
- [x] `npx eslint .` clean
- [x] `npx vitest run` green (156/156; 2 new + 11 retargeted to the trickle)
- [x] `pnpm build` succeeds
- [x] E2E: 12/12 scenarios

## Validation

- [x] Full battery executed 2026-10-12

## Status

- [x] Inspect / Implement / Test / Validate / Report

## Next decisions (not this step)

- Pollution effects beyond admission (QoL/mortality); per-cell pollution.
- Renewable wood (long-run economy boundary); D3 second step (mills/goods).
- Tech/Âge 1 (phase 8); storage caps (D5).
