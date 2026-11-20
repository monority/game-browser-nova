# Step029 — ui.ts Split (panel components)

Baseline: `f002e7c` (Step028 corrective). Implements the audit's medium
item: `src/app/ui.ts` (637 lines, 5 responsibilities) split into panel
components (AGENTS.md §16: small components, explicit props,
composition).

## 1. Structure

| File | Lines | Responsibility |
|---|---|---|
| `src/app/ui.ts` | 144 | Orchestrator: assembles panels, owns status line + hover tooltip, exposes the stable `Ui` facade |
| `src/app/ui/kit.ts` | 130 | Tokens (`TOKENS`), `SPEED_SETTINGS`, `PALETTE_TYPES`, DOM primitives (`panel`, `styleButton`, `textButton`, `staticNote`, `sectionHeader`, `statRow`) |
| `src/app/ui/statsPanel.ts` | 105 | `#stats` column: stat rows + forecast + alerts |
| `src/app/ui/controlsPanel.ts` | 187 | `#controls` bottom bar: palette (age locks, selection state), road mode, save/load, overlay toggles, speed |
| `src/app/ui/inspectionPanel.ts` | 143 | `#inspection` right column: building inspection + analysis drill-down (latest wins), mothball/remove actions |
| `src/app/ui/progressionPanel.ts` | 98 | `#progression`: age header, milestones, research, advance |

Panels receive narrow props (each declares the callbacks it actually
uses) instead of the whole `UiCallbacks`. Shared DOM/selector contract
(`data-action`, `data-build-type`, `data-section`, `data-resource`,
`data-staffing`, `dataset.inspection`/`drilldown`) is unchanged — all 15
E2E scenarios pass unmodified, which is the behavior-preservation proof.

## 2. API and dead code

- `createUi(container, callbacks): Ui` — public surface unchanged;
  `main.ts` untouched (still imports only `createUi`).
- `SPEED_SETTINGS`/`SpeedSetting` moved to `kit.ts` (no re-export: they
  were flagged over-exported in the audit).
- Dropped dead local `alertsBlock` (created, never used — gone with the
  split).
- One subtle behavior preserved: palette/road buttons keep the hover
  effect via `styleButton` (first draft of the split lost it; caught in
  review before gates).

## 3. Validation (all executed 2026-10-14)

- `npx tsc --noEmit`: PASS. `npx eslint .`: PASS.
- `npx vitest run`: PASS — 17 files / 217 tests.
- `npx vite build`: PASS.
- `npx playwright test`: PASS — 15/15 (unmodified suite; selector and
  flow parity is the regression proof for the split).
- Visual identity unchanged by construction (same tokens, same DOM
  shape); flow-level coverage via the E2E suite (inspection, drill-down,
  overlays, palette, speed, progression).

## 4. Remaining audit items (not done, recorded)

- `serialize` passes live deposit references into the save document —
  defensive deep-copy still pending.
- Product questions from the audit remain open: age-3 dead end,
  decorative bld milestones post-D2, all-or-nothing plank throughput,
  market forecast precision.
