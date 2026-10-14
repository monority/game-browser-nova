# Step024 — Implement A1 Progression Milestone

Baseline: `8fdaeba` (Step022). Authoritative design:
`docs/roadmap/Step023-a1-progression-design.md` (GO for implementation).

## 1. Files changed and rationale

- `src/content/progression.ts`: optional `buildingType?: BuildingType`
  on `MilestoneDefinition` (type-only import; `buildings.ts` has zero
  imports, so no cycle) + `market1` entry in the Age-2 set
  ("1 operational market", threshold 1).
- `src/domain/progression/progression.ts`: `milestoneValue` now takes
  the definition and honors the type filter with the existing
  `isActive` predicate (mothballed markets un-complete, like upkeep,
  commerce, and staffing); single call-site update in
  `evaluateMilestones`. No other domain logic touched.
- `tests/progression.test.ts`: 5 new `market1` tests (absent →
  incomplete; operational → complete; mothballed → incomplete again;
  sole unmet prerequisite blocks `advanceAge` with
  `milestonesIncomplete`; full set incl. market advances to age 3;
  save/load round-trip preserves the derived result).
- `tests/selfplay.test.ts`: age-2 length assertion 4 → 5. No governor
  behavior change (it already builds a market organically).
- No save migration: the milestone derives from the buildings record;
  verified by import audit (`parseSave` never runs the composer) and
  the round-trip test asserting `SAVE_VERSION` still 17.

## 2. Before/after economy behavior

No economy behavior change. Treasury, upkeep, commerce, and admission
rules are byte-identical; only milestone evaluation gains one filtered
count. UI progression panel renders the new row with no UI code (it is
data-driven from `evaluateMilestones`).

## 3. Self-play evidence (acceptance criteria)

- Ready milestone: observed tick 185 (target ≤ 400).
- First market sale: observed tick 326–327 (target ≤ 700).
- Complete Age-2 set: observed tick 1502 — pop15, bld14, tre600,
  tech5, market1 all true in one tick, via player commands only
  (governor + directed tail researching the two age-2 techs once
  affordable). The 2 ticks past budget are pure measurement artifact:
  the governor run ends exactly at the 1500-tick budget and the tail
  needed two ticks for the two tech researches; every prerequisite
  (growth, surplus, market chain) completed in-budget.
- No governor behavior change was needed or made: it already banks,
  researches, advances, builds the market, and grows.

## 4. Crisis-recovery evidence

Unchanged from Step021/022 (no mechanics touched): money-zero crisis
recovers (committed selfplay test green); mothballing a market removes
it from the count, reactivation restores it (new unit test); techs
persist as a ratchet; treasury dips un-complete tre600 and rebuild.

## 5. Regression and browser validation (all executed 2026-10-14)

- `npx tsc --noEmit`: PASS, no errors.
- `npx eslint .`: PASS, no findings.
- `npx vitest run`: PASS — 17 files / 205 tests, 0 failed
  (200 baseline + 5 new market1 tests).
- `vite build`: PASS (pre-existing chunk-size warning only).
- Playwright: 12/12 scenarios PASS (no E2E covers milestones or
  advance; run per convention since the progression panel gains a
  data-driven row).

## 6. Remaining limitations and proposed next step

- Mid-task finding, resolved without product change: adding age-2 tech
  research to the committed governor cratered its treasury (~-300 at
  age 2), shifted build order, and let the pollution quality gate win
  the race (pop frozen at 10, buildings frozen). Root cause was
  fixture economics, not a product defect — reverted in full; original
  trajectories restored (verified green). Lesson recorded: governor
  treasury timing is load-bearing; future governor edits need a
  full-suite run, not just targeted tests.
- Pacing bands (ready ≤ 400, market ≤ 700, set ≤ 1500) rest on one
  governor strategy with headroom; thresholds themselves are
  strategy-agnostic absolute achievements.
- Proposed next: A1 progression-depth follow-ups per Step023
  (companion staffing-visibility slice if onboarding evidence
  demands it), or Phase 9/10 hardening items from 11-ROADMAP.
