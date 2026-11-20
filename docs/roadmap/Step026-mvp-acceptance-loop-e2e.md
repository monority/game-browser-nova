# Step026 — MVP Acceptance Loop E2E (full-loop browser journey)

Baseline: `b5e0e12` (Step025). Implements Phase 10's "E2E full-loop scenario"
and the `docs/game/02-MVP.md` §12 acceptance scenario through the real UI.
Test-layer slice: no `src/` change.

## 1. What changed and why

- `e2e/nova.spec.ts` — new journey
  "MVP acceptance loop: build -> produce -> research -> Age 2 -> market sells".
  Maps each §12 step to an observable UI/simulation assertion:

  | §12 step | Journey assertion |
  |---|---|
  | Start colony | D2 baseline: pop 10, ≥ 22 buildings, age 1 |
  | (Age 1 gate) | Market palette button disabled + "requires Age 2" |
  | Build infrastructure | farm placed via palette + canvas click |
  | Production changes | food forecast row rises `Food 11/13` → `Food 13/13` once staffed |
  | Research / milestone | 3 techs researched via panel buttons; advance button appears |
  | Age 2 begins | advance clicked via UI; age 2; panel shows "Age of Expansion (Age 2)" |
  | Age-2 system | market palette entry unlocks (enabled, no age suffix) |
  | Build market | market placed via palette + canvas |
  | Economy change | stats `market` row ≥ 1 (surplus food sold for money) |

- Scenario setup (money 600, planks 5, population 13, road cells touching
  the new farm/market) goes through the `__nova` diagnostics surface —
  the established pattern in this suite. Every asserted causal step
  (staffing, production, research, age advance, market sales) flows
  through the real UI commands and simulation.

## 2. Findings during implementation (no product defect)

- Canvas-placed buildings are not automatically road-adjacent: the farm
  placed at the canvas position initially starved because D2's roads do
  not touch that cell, so it never became eligible for staffing
  (production stayed 11 vs pop 13 → food wipe). The journey now connects
  the new farm with a road cell (scenario setup) before ticking —
  mirrors the market's road requirement, no product change.
- With pop 13, production (13) equals consumption until cropRotation is
  researched; the inventory-growth assertion is placed after the tech
  research so the surplus is real (production 19 vs 13).
- Determinism verified: journey re-run 3/3 green; no timing dependence on
  incidental pre-build ticks (all resources are set before ticking).

## 3. Self-play / economy evidence

Not applicable — test-layer slice. E2E evidence: journey green (single
run + 3/3 repeats); full suite 14/14.

## 4. Validation (all executed 2026-10-14)

- `npx tsc --noEmit`: PASS.
- `npx eslint .`: PASS.
- `npx vitest run`: PASS — 17 files / 218 tests.
- `npx vite build`: PASS.
- `npx playwright test`: PASS — 14/14 scenarios (13 + 1 new).

## 5. Remaining limitations and proposed next step

- The journey sets scenario resources via `__nova`; a no-setup variant
  (pure UI from D2 to Age 2) is possible but slow (treasury 200 needs
  ~100 organic ticks) — recorded, not built.
- "Automated distribution" and "satisfaction" from §12 have no dedicated
  system (MVP exclusions); the journey covers the implemented chain
  (production → inventory → economy → milestone → age).
- Proposed next: performance profiling (the only `UNKNOWN` row in
  STATE.md; renderer rebuilds all meshes per tick — measure before
  optimizing per 02-MVP §11).
