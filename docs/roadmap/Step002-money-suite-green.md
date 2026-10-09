# Step002 — Money-Suite Green & Foundation Docs Reset

Parent: Step001 (money migration, left red at `87f862e`).
Date: 2026-10-08.

## AUDIT

Step001 ended mid-migration: `tsc`/`eslint` clean but `vitest run` red with
339 failed / 1538 passed, plus an in-tree foundation pass (AGENTS.md + docs
corpus rewrite, 90 test files partially migrated) sitting uncommitted.
`docs/STATE.md` carried `UNKNOWN` placeholders; no audit report existed for
the new foundation.

## OBSERVATIONS

- The migration had renamed the `material` resource to `money`, removed the
  per-Workshop Material production/storage, and re-based the economy on
  taxes + commerce + uniform maintenance (baseline validated in Step001).
- 48 tests across 26 files still asserted the old economy arithmetic
  (gross Workshop output, storage clamps, worker-earned income).
- `SAVE_VERSION` moved 7→8→9 during the migration; several audit suites
  pinned the old numbers.
- The UI stats surface exposes money-era fields
  (money/taxes/commerce/revenue/maintenance/netMoney).

## DECISION

No new gameplay. Close the migration:

1. Fix typecheck/lint blockers.
2. Migrate every failing test to the measured Step001 behavior — src is
   authoritative; where a test's premise was structurally obsolete
   (revenue was staffing-dependent), re-target the assertion to the new
   invariant and say so in a comment.
3. Fill `docs/STATE.md` from executed commands, write the dated audit
   report, and record the D1 balance finding.

Product decisions deliberately NOT taken here: any change to tax/commerce/
maintenance numbers (D1) is recorded as an open question, not tuned.

## IMPLEMENTATION

Test migration highlights (all verified against measured behavior):

- Maintenance is per operational building (residences pay): fixtures and
  expectations updated (`maintenance`, `spatialEmploymentPreference`,
  `roadConstruction` P, `workshopWaterConstruction`).
- Revenue is staffing-independent (commerce follows the road connection):
  reassignment tests now assert production-mix trade-offs instead of
  revenue changes (`coreSimulationHardening`, `nextGameplayPressureAudit`,
  `mixedTownWaterPressureAudit`, `townDecisionFrontierAudit`).
- Vacant connected Workshops still earn commerce
  (`maintenance` F, `nextCausalCapabilityDiscovery`, `spatialEmploymentPreference` M-H).
- Construction-fixture timing: several fixtures rested one tick before a
  2-tick building completed; tests either complete construction locally or
  account for it (`constructionMaterialFlow`).
- Same-tick revenue lands before commands: road/build affordability
  arithmetic updated (`roadAffordabilityParity` R2/R3/R8,
  `roadConstruction` N, `buildingMoneyAffordability` M6).
- The material storage clamp no longer applies to the Workshop (money is
  uncapped): `roadConstruction` O re-targeted to commerce-on-completion.
- `SAVE_VERSION` pins updated to 9; forecast resource keys
  `construction`→`money`; readability stat inventory moved to the money-era
  fields (40 fields, 33 test ids).
- Scenario text de-externalized ("trade"→"commerce") to satisfy the
  no-external-actors audit.
- `water-reserve-industry` regression test now asserts the measured Step001
  reality: the second Well is unfundable (net −1/tick) — recorded as the D1
  balance question, not silently "fixed" by tuning constants.
- Cleanup: deleted `audits.txt` (debug stdout log).

## VALIDATION

Commands executed 2026-10-08:

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 121 files / 1877 tests, 0 failed |
| G8 | `npm run build` | PASS (vite) |
| G9 | full E2E suite (`test:e2e` + all 26 `test:e2e:*` scripts) | PASS — 27/27 scripts, 336/336 checks, 0 failed, 0 skipped |
| G10 | `git diff --stat` / per-file review | reviewed |

### E2E reconciliation (finalization pass)

11 scripts still asserted the pre-money UI contract (removed stat fields
`storageCapacity`/`materialProduction`/`materialUpkeep`/`netMaterial`/
`storedProduction`, old inspection strings, storage-crest funding premises).
All were minimally retargeted to the money-era surface:

- stat-field mappings: `materialUpkeep`→`maintenance`, `netMaterial`→
  `netMoney`, staffed/producing markers → `staffedWorkshopIds`/`commerce`;
- inspection strings → the Step001 texts (e.g. `Commerce — connected
  +2/tick · jobs w/1 · maintenance 1/tick`);
- storage-crest funding premises (jobs scenario 2, transport Farm,
  road shortcut, housing recovery road, industrial second Well) were
  unfundable under the net ≤ 0 baseline: each now proves the measured
  reality and cites the D1 finding instead of inventing income;
- `SAVE_VERSION` pins in browser assertions updated 8→9.

No business behavior was changed to make a test pass; where a script
revealed a genuinely new Step001 behavior (vacant Workshop still earns
commerce; residences pay maintenance), the assertion documents it.

## RESULT

Suite green (1877/1877 unit, 336/336 E2E checks across 27 scripts) for the
first time since the money migration. Step001's closure conditions are met.

## D1 — economic design finding (deferred, deliberately not recalibrated)

> Step001 baseline currently creates net-negative pressure in several colony
> shapes (e.g. a 2-colonist village with a Workshop nets −1/tick: revenue 4 =
> 2 taxes + 2 commerce vs maintenance 5). This is a validated observation,
> not a calibration change for Step002.

Consequences measured and documented in the tests/E2E (not hidden):

- `water-reserve-industry` cannot fund its promised second Well;
- several E2E recovery/financing premises (labour-financed construction,
  storage-crest growth) are no longer reachable;
- growth blocked at a 0 treasury never resumes by itself.

No economic constant was changed in Step002. The income/expense balance is
the next product decision (Step001 D1 remainder: prices, income/expense
balance, day-0 setup — pending product review).
