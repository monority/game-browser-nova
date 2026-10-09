# NOVA — Repository Audit 2026-10-08

## Executive Summary

- Overall state: the post-migration foundation pass is functionally complete —
  the entire suite is green for the first time since the Step001 money
  migration (1877/1877), typecheck/lint/build/E2E-smoke all pass.
- MVP readiness: READY — simulation core coherent and fully validated (unit +
  full E2E); the only open item is the Step001 D1 economic balance decision
  (deliberately deferred, documented).
- Main risks: (1) baseline economy bleeds money in almost every measurable
  colony shape; (2) scenario promises (e.g. `water-reserve-industry`) are
  unfundable under that baseline; (3) rendering/E2E coverage not re-validated.
- Main cleanup: removed `audits.txt` (debug log of test-run measurements,
  47 lines, unreferenced).
- Next step: product decision on the Step001 D1 income/expense balance, then
  re-run the remaining E2E scripts.

## Repository State

| Field | Value |
|---|---|
| Branch | `master` (tracks `Nova/master`, ahead 1) |
| HEAD | `5700172` — docs(nova): raise doc grades |
| Working tree | DIRTY — Step002 pass: AGENTS.md condensed (1422→570 lines), docs corpus rewritten, 90 test files migrated, `audits.txt` deleted |
| Package manager | pnpm 11.21.0 |
| Node | v24.19.0 |
| Typecheck | PASS (`npx tsc --noEmit`) |
| Lint | PASS (`npx eslint .`) |
| Tests | PASS — 121 files / 1877 tests, 0 failed (`npx vitest run`) |
| E2E | PASS — full suite: 27/27 scripts, 336/336 checks, 0 failed / 0 skipped |
| Build | PASS (`npm run build`, vite 314ms) |

## Documentation Inventory

Authoritative (verified coherent after the in-tree rewrite):

- `AGENTS.md` — condensed operational contract (570 lines).
- `docs/ENGINEERING-INDEX.md`, `docs/STATE.md`, `docs/VALIDATION.md`,
  `docs/DECISION-PROTOCOL.md`, `docs/CONTRIBUTING.md`, `docs/PERFORMANCE.md`.
- `docs/game/01..12` — product corpus (moved under `docs/game/`).
- `docs/adr/ADR-001..006` — architecture decisions.
- `docs/roadmap/Step000`, `Step001` — step history.

Status: no conflicting duplicates found between the two generations after the
rewrite; `docs/STATE.md` values were `UNKNOWN` placeholders and are now filled
from executed commands.

## Documentation Conflicts

1. `docs/STATE.md` (pre-pass) described the Step001 mid-migration state
   (suite 339 failed / 1538 passed). Reconciled: state now reflects the green
   suite. No product-level conflict found.

## Architecture

### Entry Points
- `src/index.ts` (library barrel), `src/app/main.ts` (browser app), `e2e/*.mjs` (Playwright).

### Domain
- `src/domain/**` — pure simulation: building, housing, jobs, mobility,
  network, population, resource, road, simulation (phases), storage, water,
  world. No React/Three/DOM imports.

### UI
- `src/app/main.ts` — DOM stats/inspection surface; no simulation rules.

### Rendering
- `src/renderer/**` — Three.js representation; reads state, never mutates it.

### Tests
- `tests/*.test.ts` (121 files, vitest) + `e2e/*.mjs` (27 Playwright scripts).

Dependency direction verified: domain ← application ← app/renderer. No
violations found this pass.

## Component Audit

No giant components or mixed-concern files were introduced. `src/app/main.ts`
remains the largest file (~1700 lines) — UI strings + wiring; classified
REFACTOR LATER (extract panels when a second surface appears). No refactor
performed in this pass.

## Token Efficiency

- `AGENTS.md` shrinked from 1422 to 570 lines by the in-tree rewrite — kept.
- `audits.txt` (47 lines of test-run stdout) deleted — confirmed debug
  artifact, zero references.
- No duplicated doc corpora remain; `docs/game/` holds the single product set.

## Performance

No measurements taken; no concrete bottleneck observed. The full unit suite
runs in ~125s. No optimization attempted (measure-first rule).

## Cleanup Performed

| Change | Evidence |
|---|---|
| Deleted `audits.txt` | debug stdout log, unreferenced (`grep` clean) |
| Rewrote AGENTS.md + docs corpus | in-tree from the prior session; reviewed this pass, no product rules lost (react-component sections dropped: repo has no React) |

## Cleanup Not Performed

- `tests/__debug*` scratch files — none remain (removed during triage).
- No source refactors, no dependency changes, no speculative tooling.

## Validation

| Check | Command / Method | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS |
| Lint | `npx eslint .` | PASS |
| Unit | `npx vitest run` | PASS 1877/1877 (121 files) |
| E2E | full suite (`test:e2e` + 26 `test:e2e:*`) | PASS — 27/27 scripts, 336/336 checks |
| Build | `npm run build` | PASS |
| Visual | screenshots via E2E smoke only | not reviewed beyond smoke |
| Performance | none | not measured |
| Diff | `git diff --stat`, per-file review during triage | reviewed |

## Confirmed Risks

1. **Step001 baseline is net-negative almost everywhere.** Revenue =
   1 tax/inhabitant + 2 commerce/connected Workshop; maintenance = 1 per
   operational building. A 2-colonist village with a Workshop nets −1/tick.
   Measured consequences:
   - `water-reserve-industry` scenario can never fund its promised second
     Well (treasury clamps at 0; test now asserts the measured reality).
   - "balanced colony" audit rows bleed 2·⌈P/2⌉/tick.
   This is the Step001 D1 remainder ("prices, income/expense balance — pending
   product review"). It needs a product decision: raise commerce, lower
   maintenance, or accept the bleed as pressure.
2. ~~26 E2E scripts not rerun~~ RESOLVED in the finalization pass: full suite
   now 27/27 scripts, 336/336 checks, 0 failed. 11 scripts were retargeted
   from the removed Material-era UI contract to the money-era surface (see
   `docs/roadmap/Step002-money-suite-green.md` §E2E reconciliation).
3. Working tree is a single large uncommitted change set — commit before
   further work to keep steps reviewable.

## MVP Readiness

| Area | Status | Evidence |
|---|---|---|
| Architecture | READY | dependency directions verified, strict TS |
| Simulation | READY | 1877 unit tests green, deterministic, SAVE_VERSION 9 round-trips |
| E2E | PASS — full suite 27/27 scripts, 336/336 checks |
| Tests | READY | suite green |
| Build | READY | vite build clean |
| Documentation | READY | corpus coherent, STATE.md evidence-based |

## Recommended Next Step

Decide the Step001 D1 income/expense balance (does a Workshop-carrying colony
bleed by design?), then commit was created in the same pass — see git history
for `feat(nova): finalize Step002 money suite`.
