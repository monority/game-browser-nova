# Step010 — Analysis Surfaces + UI Polish

Baseline: `e784cd4` (Step009). Implements the analysis layer (MVP Phase 6 /
`docs/game/09-UI-UX.md`) and interaction polish. **No simulation rules or
economic constants changed.** Date: 2026-10-09.

## IMPLEMENTATION

### Analysis (new `src/application/queries/analysis.ts`)
- `getResourceSummaries`: per survival resource (food/water) —
  production/tick (staffed active farms/wells), consumption/tick
  (pop; water capped by stock served), balance, stock, and **ticks
  remaining** when the balance is negative (`floor(stock / |balance|)`).
- `getAlerts`: state-communicating alerts, never instructions (design rule):
  food deficit countdown, zero-stock food warning, water served X/Y,
  treasury frozen at 0 with net/tick. Reuses economy queries (no duplicated
  arithmetic).
- UI: single left panel = stats + Forecast section + Alerts section
  (amber warnings), bounded height with scroll; per-tick refresh.

### Polish
- Inspection detail line per building type (production/commerce/housing).
- Hover tooltip in inspect mode: building state flags, deposit remaining,
  road (states, not instructions).
- Keyboard: `Space` = pause/play toggle, `1/2/4/8` = speeds — drives the
  same DOM buttons so the highlight stays in sync.
- **Bug fix found during the slice:** speed buttons 2×/4×/8× never changed
  `ticksPerSecond` (only pause/unpause worked). Speeds now set the rate;
  E2E asserts ≥ 10 ticks per 1.5s at 8× (vs ~3 at the broken 1×).

## VALIDATION (executed 2026-10-09)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 11 files / 132 tests (10 new analysis), 0 failed |
| G8 | `pnpm build` | PASS |
| G9 | `pnpm test:e2e` | PASS — 10/10 scenarios (2 new: analysis surfaces, keyboard) |
| G10 | per-file diff review | PASS |

## RESULT

The analysis layer answers the MVP information path (production →
consumption → balance → stock → countdown) with alerts that expose causes
without prescribing solutions. UI interactions (speed, pause) now actually
work as labeled.

## DEFERRED

Colored grid overlays (food/water/pollution), analysis center drill-down,
history graphs, D3/D6, starvation terminal state.
