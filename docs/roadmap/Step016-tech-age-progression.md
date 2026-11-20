# Step016 — Techs + Age Progression (Phase 8 MVP)

Baseline: 4fe7b17 (Step015 docs sync). Implements Phase 8: complete Age 1,
small technology choice set, milestones, transition, and beginning of Age 2.
Date: 2026-10-12.

## DESIGN

- Five techs: Crop Rotation, Masonry, Trade Routes (Age 1); Irrigation,
  Deep Mining (Age 2). Costs 50 Age 1 / 150 Age 2; one-shot; age-gated.
- Effects are additive per tech: farm food +1, quarry stone +1, connected
  workshop commerce +1.
- Milestones are derived from canonical facts, never stored. Age 1 needs
  population 8, 8 operational buildings, treasury 200, 3 techs. Age 2 needs
  population 15, 14 buildings, treasury 600, 5 techs. Advance requires all.
- Commands: researchTech (unknown/age/money/duplicate rejected);
  advanceAge (milestones-gated).
- Persistence: SAVE_VERSION 16; sequential v13-v14-v15-v16 migration;
  strict validation for age and tech ids; version range check.

## IMPLEMENTATION

- Content: techs, progression milestones, age names.
- Domain: hasTech/techLevel/evaluateMilestones/canAdvanceAge; GameState age
  plus researchedTechs; farm/quarry/commerce effects.
- Application: save/parse v16; analysis food forecast uses farm tech level.
- UI: progression panel with milestones, research buttons, advance button.
- Renderer: warmer Age 2+ atmosphere (fog/background/directional tint).

## VALIDATION (executed 2026-10-12)

- npx tsc --noEmit: PASS, no errors.
- npx eslint .: PASS, no findings.
- npx vitest run: PASS, 14 files / 169 tests, 0 failed (13 new progression).
- pnpm build: PASS.
- Playwright: PASS, 12/12 scenarios.

## RESULT

Age 1 is completable from start to transition. Research changes production
and economy. Age 2 unlocks higher techs and a distinct atmosphere while the
old city continues. D-series tech/age scope is implemented; Age 2 depth
continues in Phase 9.

## DEFERRED

Age 2-specific systems/buildings, renewable wood, pollution depth beyond
admission gating, graphs, storage caps.
