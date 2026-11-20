# Step036 — Age-3 E2E Journey

Baseline: `13c0228` (Step035). Closes the gap Step035 recorded:
"no age-3 E2E — no journey reaches Age 3 through the UI yet".

## 1. What shipped

New `e2e/progression.spec.ts` — one journey, `NOVA progression`
describe, following the Step026 acceptance-loop pattern (scenario
resources via `__nova`, every asserted transition through real UI):

1. Setup: money 1500, planks 5, pop 15 (diagnostics surface).
2. Age 1: panel shows the set; `advance-age` absent (tech3 unmet).
3. Research 3 age-1 techs via panel buttons → advance appears →
   click → Age 2 ("Age of Expansion" header, market1 row renders,
   advance hidden until the 5-set completes).
4. Market via palette + canvas + touching road (command) → 8x until
   `operational` → pause → `market1` milestone done via diagnostics.
5. Research irrigation + deepMining via panel → advance to Age 3.
6. Age-3 assertions: "Age of Prosperity (Age 3)", all five
   prosperity milestone labels, current/threshold values
   (15/20 pop, 24/30 buildings = D2 23 + market, 10/20 residences,
   2/3 workshops), and no advance action past the last set.

## 2. Evidence notes

- D2 baseline is 23 buildings (1 center + 10 res + 5 farm + 5 well +
  2 shops) — asserted as 24/30 with the market.
- The 8x window (market construction, 2 ticks) keeps food/water
  headroom for pop 15 (D2 stocks + staffed producers; no famine path).
- Journey stable: 3/3 consecutive runs green on local Chromium.

## 3. Validation (all executed 2026-10-19)

- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `npx vitest run`: 20 files / 254 tests green.
- `npx vite build`: PASS (851ms).
- `npx playwright test`: **20/20** scenarios (19 + 1 new), local
  Chromium; new journey 3/3 stable.
