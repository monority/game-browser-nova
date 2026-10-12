# Step011 — Analysis Overlays + Forecast Drill-down

Baseline: `02bb8dd` (Step010). Second analysis-layer slice: grid overlays
and per-resource drill-down. **No simulation rules or economic constants
changed.** Date: 2026-10-09.

## IMPLEMENTATION

### Overlays (`src/renderer/overlay.ts` — pure, unit-testable mapping)
- `computeOverlay(state, mode)` → cell tints. **Staffing overlay**:
  workplaces tinted ok (staffed, green) / warn (idle — needs colonist or
  road access, amber) / off (mothballed, gray); anchor and residences
  untinted. Deposits mode relies on the existing deposit markers.
- Renderer: `setOverlay(mode)`; building meshes recolor on the next update
  (overlay tint replaces the type color).
- UI: overlay toggle group (None / Staffing / Deposits) in the controls
  panel; active toggle highlighted.

### Drill-down (`getResourceContributors` in analysis.ts)
- Clicking a Food/Water forecast row opens the contributors panel: every
  producing building with its state (staffed / idle / mothballed, color
  coded) + aggregate consumption (population). The right panel is shared
  with building inspection (latest selection wins).

## VALIDATION (executed 2026-10-09)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 12 files / 140 tests (8 new), 0 failed |
| G8 | `pnpm build` | PASS |
| G9 | `pnpm test:e2e` | PASS — 11/11 scenarios (1 new: overlays + drill-down) |
| G10 | per-file diff review | PASS |

## RESULT

The bottleneck diagnostic loop is closed visually: the staffing overlay
exposes idle capacity on the grid, and the drill-down explains *why* a
resource is short (which producers are staffed/idle/mothballed).

## DEFERRED

Water-coverage per-network overlay (requires per-network water semantics —
current water is a global stock), analysis center drill-down deeper levels,
history graphs, D3/D6, starvation terminal state, environment, tech/ages.
