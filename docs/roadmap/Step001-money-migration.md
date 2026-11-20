# Step001 — Money Migration (Material → Money)

## AUDIT

Objective: resolve Step000 open point **D1** (Money model) and migrate the
economy from construction-Material-as-currency to an accounted Money
treasury, per `docs/game/02-MVP.md` §4 (money, public budget, income,
expenditure). Docs-only step report — implementation is in progress in the
working tree; **no gameplay change is decided here**.

Prior commit in this step:

- `87f862e` — "migrate audit suites to Step001 money model". Removes
  old material-storage references
  (`MATERIAL_STORAGE_PER_OPERATIONAL_WORKSHOP`,
  `getMaterialStorageCapacity`,
  `getMaterialStoredProductionPerTick`, `PROTECTED_MATERIAL_RESERVE`,
  `StorageHub.material`, `coveredByProtectedReserve`). Replaces them with
  uncapped-treasury equivalents (revenue = tax + commerce, maintenance =
  all operational buildings, `coveredBySameTickInflow`, `SAVE_VERSION 9`).
  Recalibrates `productDepth`, `productExperienceII`,
  `productionEconomyMeasurement` to measured values. Drops dead imports.

Evidence from `src/` (HEAD `87f862e`):

- Money is the colony treasury: taxes per inhabitant plus commerce per
  connected operational Workshop (`src/domain/resource/resource.ts`).
- `INITIAL_TREASURY = 100` (deterministic day-0 setup).
- `TAX_PER_INHABITANT_PER_TICK = 1`;
  `COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK = 2`.
- The treasury is uncapped by design — money is accounted, not stored as
  a physical good — while Food and Water keep storage capacity.
- Maintenance is charged on all operational buildings.
- `SAVE_VERSION = 9`, `MIGRATABLE_SAVE_VERSION = 8`
  (`src/application/persistence/save.ts`).

## OBSERVATIONS

What the migration changes (evidence from HEAD diff):

- Construction and upkeep no longer consume construction Material;
  they draw from the Money treasury (partial payment, never negative).
- Revenue is same-tick inflow (taxes + Workshop commerce), replacing the
  protected material reserve mechanism.
- Audit suites were recalibrated to measured post-migration values.

What is NOT done (evidence from working tree, 2026-10-07):

- 9 test files carry uncommitted modifications on top of HEAD
  (`housingWorkforceAdmissionAudit`, `industrialHeadroomAudit`,
  `nextDependencyDesignIntake`, `phaseFreezeTownDependencyAudit`,
  `progressionScenarioContractAudit`, `seniorCoherenceAudit`,
  `terrainObstacleDesignContract`, `terrainSpatialInput`,
  `waterBootstrapEconomyAudit`).
- Full suite (`vitest run`, 2026-10-07): **79 files failed / 42 passed**,
  **339 tests failed / 1538 passed** (1877 total). Failure pattern is
  uniform: old-model expectations (Material construction costs,
  `SAVE_VERSION` 6/7 assertions, Material upkeep, `construction` resource
  in catalogues) against the new money model. Top clusters:
  `economicInvariants` (16), `laborCapacity` (12), `jobs` construction
  material production (8), road production/access (8), save-migration
  version assertions.
- Failing suites were identified, not repaired, in this docs pass.

## DECISION

Direction taken (records Step000 D1 as *in implementation*, still open
until the suite is green):

1. Money is an accounted treasury (tax + commerce inflow), not a renamed
   physical stock.
2. Maintenance applies to all operational buildings.
3. Persistence moves to `SAVE_VERSION 9` with explicit migration from 8.
4. **Baseline validated (user, 2026-10-07):** `INITIAL_TREASURY = 100`,
   `TAX_PER_INHABITANT_PER_TICK = 1`,
   `COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK = 2`, maintenance on all
   operational buildings. Balance tuning happens on measured values after
   the suite is green, per the measure-first rule.

Still open (no gameplay change decided here):

- D1 remainder: prices, income/expense balance, day-0 setup — pending a
  green suite and product review.
- Step000 D2 (10-inhabitant start), D3 (aggregate population shape),
  D4 (manual reassignment UI) — untouched by this step.

## IMPLEMENTATION

This step so far: commit `87f862e` + this file + `README.md` current-step
update. No new gameplay system was introduced — only the currency
mechanism and its audit recalibration.

## VALIDATION

Commands actually executed 2026-10-07 (docs pass, no code changed):

| Gate | Command | Result | Evidence |
|---|---|---|---|
| G1 | `npx tsc --noEmit` | PASS | No TypeScript errors |
| G2 | `npx eslint .` | PASS | No findings |
| G3 | `npx vitest run` | FAIL (expected, mid-migration) | 79 files failed / 42 passed; 339 failed / 1538 passed (1877) |
| G10 | `git status` | DIRTY (pre-existing) | 9 modified test files, uncommitted, predate this docs pass |

Not rerun here: production build, E2E/browser (no rendering change in
this step beyond the economy mechanism; E2E required before closing).

## RESULT

**In progress, not green.** The money-model direction is implemented and
type/lint-clean, but the suite is red with the expected old-vs-new model
pattern. Closing this step requires: finish the 9-file test migration,
commit, full green suite, build + E2E, product review of D1 remainder.
Step000 gaps D2–D4 remain open and out of scope.
