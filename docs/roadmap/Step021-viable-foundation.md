# Step021 - Viable Foundation (implements Step020)

Authorization: Step020 design approved (Step020 committed as 52b3cbb).
Implements exactly that contract. No Easy/Hard presets, no sliders,
no unrelated redesign. Baseline: 7f8d36a (Step019).

## 1. Files changed and rationale

- src/domain/economy/economy.ts: isMaintenanceExempt covers residences
  (housing is infrastructure, same predicate shape as the anchor
  exemption); MIN_POP_FOR_COMMERCE = 8 + commerceUnlocked(); base floor
  gated in collectRevenue, throughput bonus always on.
- src/domain/simulation/state.ts: composeD2Colony in createInitialState -
  10 pop, 10 residences, 5 farms, 5 wells, 2 workshops with roads,
  food 60 / water 40 / money 100, all operational, granted free.
  Deterministic y/x scan; throws only on a world too small to hold it.
- src/application/queries/stats.ts + analysis.ts: commerce honesty
  mirrors the gate (base term gated, throughput always on); money-stuck
  alert net uses the gated base.
- docs/game/02-MVP.md: D2 composition, exemption, and gate recorded as
  decided/implemented.
- tests: 13 unit files adapted to D2 coexistence (stripToAnchor helper
  isolates mechanics through real removal commands); new unit proofs:
  exemption arithmetic, pop gate on/off, vacant-earns above gate,
  residence-spam and deactivate-reactivate exploit guards, D2 composition;
  selfplay rewritten to the full D2 loop (advance + market + crisis).
- e2e/nova.spec.ts + helpers.ts: stripToAnchor helper; count tests made
  D2-aware (deltas, not absolutes); mechanic scenarios isolate then
  rebuild small.

## 2. Before/after economy behavior

- Before: canonical bootstrap (pop 0, empty map, 100 money) stalls at
  pop1/money0; D2-shaped starts stagnate at pop10/money0 (Step019/020).
- After: D2 day-0 nets about +2/tick (10 taxes + 4 commerce against
  5 farms + 5 wells + 2 workshops upkeep; residences exempt), banks to
  400, researches all Age-1 techs back-to-back, advances ~t185,
  builds the market ~t326 with first sales the next tick.
- Commerce below pop 8 is exactly 0 (unit-proven); throughput bonus
  flows from the first plank regardless of pop.

## 3. Self-play evidence (acceptance: 12 inhabitants and beyond)

- Full loop: ready@185, age2@185, pop12@218, market-built@326,
  market-sale@327, save round-trips at advance, mid-run, and end.
  Trajectory (pop/money/food/water/shops/techs/age/bldgs):
  t1 10/102/.../2/0/1/23; t150 10/400/.../2/0/1/23;
  t300 14/86/.../4/3/2/38 (growth spends the bank, then rebuilds).
- pop12 reached from the D2 10 via staffed-well water surplus once
  cropRotation frees farm workers (tech-to-slack interaction, measured).
- Additional construction after pop12 funded: housing to 14, lumber
  camp, quarry, park, market (bldgs 23 -> 38+).
- Determinism: double-run state + phases identical.

## 4. Crisis-recovery evidence

- Money-zero crisis (money 0 + food 8 injected at t300, no injection
  after): colony still advances (prior), reaches market-sale@342,
  ends pop >= 10 with treasury rebuilt past 200. Recovery path:
  mothball coast (upkeep shed) + Center trickle reseeding, both
  pre-existing mechanics, verified against the new exemption/gate
  arithmetic (unit: residence-only colony pays 0; mothballed workshop
  earns 0).
- Exploit review (all unit-proven): residence spam adds no upkeep and
  no income (pure cost); demolition refunds nothing; deactivate +
  reactivate prices commerce exactly once (single revenue computation,
  same active flag gates both flows); pop threshold evaluated on
  settled post-tick population (commands cannot move pop); mothballed
  buildings earn nothing under either rule.

## 5. Regression and browser validation (all executed 2026-10-13)

- npx tsc --noEmit: PASS, no errors.
- npx eslint .: PASS, no findings.
- npx vitest run: PASS - 17 files / 198 tests, 0 failed (+7 since Step019: gate boundary, vacant-earns, exploit guards x2,
  D2 composition, crisis case).
- pnpm build: PASS.
- Playwright: PASS - 12/12 scenarios (9 rewritten for D2 coexistence;
  journeys preserved, assertions converted to D2-aware deltas).
- Save compatibility: no state shape change, no migration; parseSave
  never runs the composer (verified by import audit); v13-v17 chain
  round-trips unchanged (persistence suite green).

## 6. Remaining limitations and proposed next step

- Growth past ~12 still needs staffed well capacity > pop; yield techs
  are the intended lever (measured interaction, not yet a dedicated
  tutorialization/UI surface).
- Market depends on the camp/plank chain firing organically; self-play
  reaches it via project-mode staffing, but a human has no visibility
  into staffing order (candidate: staffing panel, separate step).
- Proposed next: A1 technology/milestone progression depth (the Step020
  mission names it as unblocked now), or the staffing-visibility slice
  if onboarding evidence demands it.
