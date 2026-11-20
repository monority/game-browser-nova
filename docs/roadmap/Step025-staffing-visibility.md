# Step025 — Staffing Visibility (UI slice)

Baseline: `5aef3a7` (Step024). Implements the companion slice recorded as
deferred in Step022/Step023: staffing order is undiscoverable and
mothball-as-staffing-lever is unguided. No simulation change.

## 1. What changed and why

- NEW `src/application/queries/staffing.ts` — `getStaffingOverview(state)`:
  a pure derived view mirroring `assignJobs` eligibility exactly
  (`isActive` + `jobCapacity > 0` + road-adjacent), ranked in the same
  canonical order (y, x, id). Each workplace entry carries `order` (1-based
  rank), `state` (staffed / idle / mothballed / no-road /
  under-construction), `reason` (why not staffed) and a `staffingLine`
  ("staffing 2/3 · idle"). States only, never instructions (design rule §7).
- `src/application/queries/analysis.ts` — info alert
  `Workforce: a/b workplaces staffed` when eligible workplaces outnumber
  the workforce (population > 0). The shortage becomes visible without
  teaching the lever; the rank order on each building makes the mothball
  lever self-evident.
- `src/app/ui.ts` + `src/app/main.ts` — inspection shows the staffing line
  for workplaces; the Age-2-locked Market palette button is now visible,
  disabled and labeled "requires Age 2" (was silently hidden); overlay
  toggle buttons carry legend tooltips.
- `tests/staffing.test.ts` (NEW, 13 tests) — order, staffed/idle split,
  no-workers vs no-road vs mothballed vs under-construction reasons,
  non-workplace exclusion, staffing-line format, determinism, alert gating.
- `e2e/nova.spec.ts` — new journey "staffing visibility": age-locked market
  button assertions, workforce alert under shortage, inspection line on the
  idle farm, then mothballing the rank-1 farm frees the worker (alert
  clears, idle farm re-inspects as "staffing 1/1 · staffed").

## 2. Before/after behavior

- Before: staffing order invisible; shortage silent; Market hidden at Age 1
  with no hint. After: order + state inspectable per workplace, shortage
  alerted, unlock condition stated on the locked button.
- Simulation, economy, persistence: untouched (no migration; SAVE_VERSION
  stays 17). No player-facing rule changed.

## 3. Self-play / economy evidence

Not applicable — no economy or simulation change. Unit + E2E evidence:
TDD red→green on the query (13/13); alert gating covered by 3 dedicated
tests; E2E journey passes first run.

## 4. Pre-existing E2E failure found and root-caused (Step025)

The committed suite's "healthy growth" E2E failed reproducibly in this
environment (population 4 < 5). Root cause, verified with deterministic
vitest probes (not a product defect):

- Post-D2 the colony starts at pop 10 with exact water balance (5 wells,
  10 water/tick). Water stock only stays > 0 if D2 wells are staffed when
  the first production phase runs; a browser page that ticks once before
  the test's build has staffed wells (admission can fire), a cold vitest
  state does not (admission frozen). The E2E failure was timing-dependent
  on that incidental pre-build tick.
- The scenario then built 6 residences; admission raced pop to 16 while
  food production stayed at 11/tick → starvation wipe → regrowth frozen at
  4 by the water gate. The scenario built housing ahead of food — the
  product correctly starved an unsustainable colony (documented
  all-or-nothing starvation).
- Fix: the test's strip now builds farms on the lower rows (food is the
  survival gate), wells above. Verified starvation-free across pre-tick
  variants 0/1/3 in vitest (pop settles 10–14, food surplus, no wipe);
  E2E green 3/3 repeat runs. Assertions unchanged (pop ≥ 5, food > 0,
  pop ≤ housing) — scenario corrected, contract not weakened.

## 5. Validation (all executed 2026-10-14)

- `npx tsc --noEmit`: PASS.
- `npx eslint .`: PASS.
- `npx vitest run`: PASS — 17 files / 218 tests (205 + 13 new).
- `npx vite build`: PASS.
- `npx playwright test`: PASS — 13/13 (12 + 1 new); growth test re-run
  3/3 after the scenario fix.

## 6. Remaining limitations and proposed next step

- Staffing overview is inspect-driven (panel per building); a colony-wide
  staffing list (all workplaces ranked in one panel) would help late-game
  triage but needs a UI decision — recorded, not built.
- Alert text states the ratio only; no ordering guidance in the alert by
  design (the inspection line carries the order).
- Exact-balance water fragility (Step022 #2) remains: admission depends
  on stock > 0 at phase time; dips freeze growth until capacity is added.
  No change proposed.
- Proposed next: Phase 10 hardening remainder (settings screen,
  performance profiling — `Performance = UNKNOWN` in STATE.md), or a
  colony-wide staffing list if onboarding evidence demands it.
