# Step013 — Visual Identity & Renderer Polish

Baseline: `92a3486` (Step012). Addresses the weakest axis of the project
review (UI/UX) against `docs/game/10-VISUAL-DIRECTION.md`. **No simulation
rules or economic constants changed.** Date: 2026-10-09.

## IMPLEMENTATION

### Distinct building silhouettes (new `src/renderer/shapes.ts`)
- Parametric per-type geometry, readable by silhouette and function:
  residence (box + pitched roof), farm (field + silo), well (cylinder +
  roof cone), workshop (hall + chimney), lumberCamp (hut + log pile),
  quarry (excavation pit + rock), colonyCenter (pedestal + crystal).
- Two-color palette per type (body + accent), defined in
  `BUILDING_PALETTE` — content, not rules.

### Scene atmosphere
- Hemisphere + directional lighting (warm key light), fog for depth.
- Terrain: subtle deterministic checker variation for tile readability;
  ground color lifted.
- Overlay tints and under-construction translucency now apply to every
  material of a building's mesh group.

### UI polish (`src/app/ui.ts`)
- Central `TOKENS` color object (dark-but-colorful identity); all inline
  hex values replaced.
- Panels: backdrop blur + soft shadow + consistent radii; buttons with
  hover feedback and transition.

## VALIDATION (executed 2026-10-09)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 12 files / 142 tests, 0 failed (unchanged suite) |
| G8 | `pnpm build` | PASS |
| G9 | `pnpm test:e2e` | PASS — 11/11 scenarios (smoke asserts zero console errors) |
| G7 visual | dev-server browser inspection | PASS — all panels render, new geometry loads without errors |

## RESULT

The scene now reads as a stylized maquette: distinct silhouettes per
building type, atmospheric lighting, tinted ground, and a coherent dark
UI identity. Zero simulation changes.

## DEFERRED

Shadows/LOD (profiling-gated), age-specific visual transformation,
per-resource coverage overlays, environment system.
