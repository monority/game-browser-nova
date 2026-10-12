# Step014 — Environment System (MVP Phase 7)

Baseline: `80af83f` (Step013). Implements the minimal coherent environment
system: global pollution stock, emissions, park absorption, and an
environmental admission gate. **SAVE_VERSION 14 → 15.** Date: 2026-10-12.

## DESIGN (minimal coherent form)

- `state.pollution` ∈ [0, 100] (canonical, persisted).
- Active workshops and quarries emit **+1/tick each**; active parks absorb
  **−2/tick each**; clamped at both bounds; no natural decay.
- `envQuality = 100 − pollution` (derived).
- Growth gate: admission (pop > 0) requires `envQuality ≥ 25` — bootstrap
  exemption mirrors the water rule. The existing population is never harmed
  by pollution in the MVP (no deaths).
- SAVE_VERSION 15 with sequential migration chain v13 → v14 → v15
  (pollution defaults to 0).

## ECONOMIC EFFECT (the intended trade-off)

Workshops are now double-edged: +2 commerce (connection) +1 (plank bonus)
but +1 pollution/tick. Parks (25 money, no jobs) are the counter-lever.
A workshop-dense colony without parks degrades its air, stalls growth at
quality < 25, and must either build parks or mothball industry — the
MVP's "environmental constraints create real planning trade-offs".

## VALIDATION (executed 2026-10-12)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 13 files / 154 tests (12 new), 0 failed |
| G8 | `pnpm build` | PASS |
| G9 | `pnpm test:e2e` | PASS — 12/12 scenarios (1 new: parks keep air clean → removal degrades) |
| G10 | per-file diff review | PASS |

## RESULT

Phase 7 (environment) implemented in minimal form: pollution, quality,
parks, admission trade-off, persistence, alerts. Stats surface shows
Pollution / Env quality; alerts fire at quality < 50 (info) / < 25
(warning).

## DEFERRED

Per-cell pollution and coverage overlays, pollution effects beyond the
admission gate (QoL/mortality), renewable wood, D3 second step,
tech/ages, starvation terminal state.
