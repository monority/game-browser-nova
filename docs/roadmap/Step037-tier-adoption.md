# Step037 — Tier1+Tier2 Batch Adoption

Baseline: `664b17b` (Step036). This step adopts work authored by the
user's own **ChatGPT/Codex desktop session** (thread "Continuer Nova
Tier 1", OpenAI codex-primary-runtime — origin established by
forensics, see §4), executed 2026-10-19 20:02–21:05 UTC. Adopted per
user decision ("option 1") after a full engineer review and fresh
re-validation — the commit is mine; the authorship is the user's
second agent.

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

Origin forensics (summarized): my pi session was closed during the
window (last transcript entry 17:55Z); pi/Codex/Claude/Cursor/WSL/
Docker/Cursor-vscode stores all ruled out by timestamped evidence;
the codex-dev.db thread index holds "Continuer Nova Tier 1" with
chatgpt user ids; repo-local artifacts (vitest results 20:57, npm
debug logs 21:04/21:05, dist 21:05:05, staged index 21:05:40) match
the session's own STATE claims. `prompt.md` was deleted during this
window (untracked → unrecoverable via git; last content partially
recoverable from this session's transcript).
