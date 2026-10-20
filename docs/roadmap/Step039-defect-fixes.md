# Step039 — Defect Corrections (per-workshop batches, load overlay, stale claims)

Baseline: `55c7a70` (Step038). Three concrete, verified defects
corrected. No product-scope decisions were taken (the open product
questions remain with the owner).

## 1. Defect — plank transformation was global all-or-nothing

**Evidence:** `plankThroughput` demanded `wood >= staffed × 2` for the
WHOLE chain: 3 staffed workshops + 4 wood → **0 planks** (and 0
throughput commerce), although the documented contract says
"per tick, per workshop… a shortfall produces nothing" — a shortfall
should stop the workshop it cannot feed, not the entire chain.

**Fix** (`src/domain/production/transformation.ts`): allocation is now
per workshop in **canonical order (y, x, id)** — the same order
`assignJobs` uses, so the earliest workshops are served first and
late-built ones starve first (Step021/Step022 triage doctrine). With W
wood, `floor(W / 2)` workshops transform. `plankThroughput` now returns
the served count (still the single source for the Step012 throughput
commerce bonus); a new `transformingWorkshops` exposes the served set.

**Tests:** `tests/transformation.test.ts` +1 regression (3 staffed,
4 wood → exactly 2 batches, not 0, not 3); all prior invariants hold
(no partial plank, missing input → nothing, determinism).

**Economy impact:** strictly more forgiving in partial-shortfall states;
identical whenever wood covers the full chain. Self-play trajectories
and all 272 tests green — no pacing shift observed.

## 2. Defect — overlay silently reset on load

**Evidence:** `swapState` rebuilt the renderer (fresh `overlayMode =
"none"`) while the UI kept its active marker → scene and UI diverged
after every load.

**Fix:** `swapState` re-applies `overlayMode`; `Renderer.currentOverlay()`
exposes the applied mode; `__nova.overlay()` in the diagnostics surface.

**Coverage:** `e2e/interaction.spec.ts` +1 test (staffing overlay →
save → load → UI marker AND `overlay()` both survive; toggling still
works). `e2e/helpers.ts` mirrors the new diagnostic (own typing, per
convention).

## 3. Stale claims / toolchain drift

- `docs/STATE.md`: branch row claimed "(local only; no remote
  configured)" — false since the remote linking; now records the origin
  and synced `main`. (The stale Commerce-DEFERRED row had already been
  removed in `e6b3587` — re-verified, no action.)
- `package.json`: the `check` script shelled out through **npm** in a
  pnpm project (and DEVELOPMENT/CI document `pnpm check`) → now
  `pnpm run typecheck && pnpm run lint && pnpm run test`.

## 4. Validation (all executed 2026-10-20)

- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `npx vitest run`: **20 files / 272 tests** green (+1).
- `npx vite build`: PASS.
- `npx playwright test`: **31/31** (+1), local Chromium, 1.2m.

## 5. Not addressed (still open, by design)

- Product questions: age-3 beyond the set, decorative bld milestones,
  plank prorata wording in UI copy (now matches the corrected
  behavior — the detail line already said "2 Wood → 1 Plank" per
  workshop, which is what the code now does).
- Ollama/pi configuration, Phase 10 `event configuration` /
  `visual polish`.
