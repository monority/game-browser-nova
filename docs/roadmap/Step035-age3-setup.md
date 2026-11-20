# Step035 — Age 3 Setup ("Age of Prosperity")

Baseline: `2a13a3d` (Step034). Unblocks the age-2 progression wall with
a milestone set built only from existing dimensions — no new mechanics,
no new techs, no new buildings (AGENTS.md §17: new systems need their
own design step). No save migration (`age` already persisted as a
number; SAVE_VERSION stays 17).

## 1. Content (`src/content/progression.ts`)

`AGE_NAMES[3] = "Age of Prosperity"`. `AGE_MILESTONES[3]` (5 entries):

| id | threshold | rationale |
|---|---|---|
| pop20 | 20 | sustained endgame holds 24 (margin 4) |
| tre1500 | 1500 | treasury grows ~350/100t late; crossed ~t770 (budget 1500) |
| bld30 | 30 | ~49 active in endgame; huge margin, structural not pacing |
| res20 | 20 | residences are never governor-mothballed → non-flapping |
| shop3 | 3 | workshops never mothballed outside project mode (see §3) |

Deliberately excluded: `techs` (all 5 techs already required by Age 2),
`market`/`warehouse` (plank-starved endgames cannot guarantee them),
`farm`/`well` counts (proven to flap under mothball cycling — active
farms rest to exactly `ceil(pop/yield)`, e.g. 8 at pop24/yield3).

## 2. Governor + tests (all in `tests/selfplay.test.ts` + `progression.test.ts`)

- **Phased housing cap**: `growthCap?` param — proven early path (cap
  14, market secured while planks exist), then growth opens post
  `market-sale`. Default `undefined` = legacy behavior; all existing
  callers byte-identical.
- **Market food gate**: only open a food-draining market with `food >
  pop*2` stock (a market liquidates surplus every tick; opening one
  during shortage pins the stock).
- **`buildMarket` flag** (default true): the sustained growth+water
  test opts out — the market drain is a confounder for a growth+water
  measurement (controlled experiment, assertions unweakened). Market
  behavior stays covered by market, main-loop and age-3 tests.
- **Emergency farm cap** (`farmHeadroom`): the uncapped emergency farm
  option spammed 86 farms on exact-balance pinning once placement
  worked; capped at the normal staffing-ratio ceiling.
- **`tryBuild` scans all free cells** for a road-viable spot instead of
  first-free-cell-only (permanent deadlock once that cell's neighbors
  fill — a real player picks another spot).
- **Age-3 test** (phased run + directed tail per Step024 precedent):
  research irrigation/deepMining once affordable, complete the Age-2
  set, advance to 3, reactivate project-mothballed workshops same-tick
  (milestones read `active`, zero drift), assert all 5 age-3 milestones
  + `canAdvanceAge` + save round-trip. Observed: market-built@326,
  market-sale@327, age-3 advance post-t1500 endgame.
- **Unit tests** (`progression.test.ts`, +4): 5-entry set, D2 baseline
  incompleteness, sole-unmet (`tre1500`) blocks with
  `milestonesIncomplete`, mothball semantics on `shop3`, save/load
  round-trip with no migration.

## 3. Root causes found en route (all evidence-backed)

1. **Governor treasury timing is load-bearing** (Step024 lesson,
   re-learned): a 300-money age-2 tech option shifted build order →
   deterministic `freeCell` deadlock (first-free spot with zero
   buildable road neighbors) + pollution quality lock → pop frozen,
   money hoarded. Reverted; doctrine: age-gated options must prove
   zero pre-gate impact AND full-suite green.
2. **Project mode never reactivates mothballed shops** — its comment
   promises "caller reactivates shops after" but no code does;
   workshops stayed mothballed forever. Covered by directed
   reactivation in-test (product code untouched).
3. **Market drain + food-stock triage interact**: market liquidates the
   1-food surplus → stock pinned 0 → triage reads crisis → mothballs
   water getters permanently → water 0. Triage keys on stock, not flow.

## 4. Validation (all executed 2026-10-16)

- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `npx vitest run`: 20 files / 254 tests green (249 + 4 age-3 unit +
  1 age-3 self-play).
- `npx vite build`: PASS.
- `npx playwright test`: 19/19 (no age-3 E2E — no journey reaches Age
  3 through the UI yet; Step024 precedent: unit + self-play).
- Pacing: age-3 advance ≈ t900–1100 in-governor (treasury-gated);
  TICK_BUDGET 1500 holds with 400+ margin.
