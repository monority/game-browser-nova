# Step037 — Tier1+Tier2 Batch Adoption

Baseline: `664b17b` (Step036). This step adopts a patch set supplied from
outside the repository and executed 2026-10-19 20:02–21:05 UTC. Adopted per
user decision ("option 1") after a full review and fresh re-validation: every
claim below was re-measured here rather than taken on trust.

## 1. Tier1 — hardening (single sources, atomic money, save guards)

- **Resize**: `renderer.ts` ResizeObserver keeps the canvas
  aspect-correct on container resize (was: boot dimensions forever);
  torn down in `dispose()`. E2E: canvas tracks two viewport sizes.
- **Hover leak fix**: `hoverMesh.geometry/material` now disposed in
  `dispose()` (previously leaked per load cycle).
- **Costs**: all money/water deductions route through
  `deductMoney`/`deductWater` (clamped, atomic); road-cost validation
  reuses `ROAD_MONEY_COST_PER_CELL` (was a literal 5).
- **Migrations/derivations**: `BASE_*_CAPACITY`/`*_PER_WAREHOUSE`
  derive from `D2_FOOD`/`D2_WATER` (state.ts) — one source, no drift;
  `ENV_QUALITY_ALERT_THRESHOLD` shared by alert + pollution overlay;
  v16→v17 migration pins literal 17 (sibling idiom).
- **Save guards**: rejects `pollution` outside 0–100 and deposits with
  `remaining > capacity` (corrupt, not plausible). Regression tests
  for inclusive bounds.

## 2. Tier2 — UX / a11y / render efficiency

- **A11y**: visually-hidden polite live regions (`status`, `alerts`);
  alert announcements fire on kind changes only (numbers never
  re-trigger); `:focus-visible` outline; Space on a focused button
  activates the button (native wins, no pause double-fire); forecast
  rows are semantic `<button>`s (UA chrome reset in CSS).
- **Render efficiency**: panels update in place — `liveStatRow` kit
  primitive, persistent forecast rows keyed by resource, alerts
  rewrite on content change only, progression rebuilds shell only on
  structural change, palette reconciliation skips no-op updates.
  Measured pre-Tier2 churn ≈ 1843/1164/1746 childList mutations per
  3s window at 8x → now pinned under 900/200/200 (E2E).
- **New overlays**: `food`, `water`, `pollution` (overlay.ts + buttons
  + legends), pure mapping with unit coverage; pollution keys on the
  shared domain threshold.
- **Renderer**: shared plain-material cache survives per-tick
  rebuilds (tinted/under-construction keep fresh instances; cache
  disposed once in `dispose()`); geometry count pinned flat across
  load cycles (E2E).
- Removed the never-firing `NOVA-DEBUG` child guard in `rebuildGroup`.

## 3. Misc

- `.gitignore` + `test-results/`; `playwright` standalone dep dropped
  (`@playwright/test` suffices — lockfile follows); AGENTS.md wording
  fix ("React" → "UI code"); `getAlerts` accepts precomputed
  summaries (boot shares one projection per tick).

## 4. Validation (all executed 2026-10-20, fresh)

- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `npx vitest run`: **20 files / 271 tests** green (+17).
- `npx vite build`: PASS.
- `npx playwright test`: **30/30** (smoke+resize, simulation, economy,
  interaction, settings, progression, accessibility +6, performance
  +3), local Chromium, 1.2m.

Origin review: the patch set arrived with its own transcript and status
claims. Both were cross-checked against this repository's artifacts before
adoption — results, debug logs, build output and staged index — and every step
listed above was re-run here. What the review could not recover (a scratch
`prompt.md` deleted while untracked) is recorded as unrecoverable rather than
assumed.
