# Step020 - Early-game economy contract (DESIGN, no src changes)

Mission: resolve the structurally unwinnable canonical economy (Step019)
before A1. Design + evidence only. No src, constant, save, or behavior
changes in this step. Baseline: a56fc58 (Step018).

## 1. Root cause (established fact)

Colony net income is `pop + commerce - upkeep`, with upkeep 1 per
operational building. Without commerce, `pop <= housing <= residences
<= buildings`, so net <= 0 ALWAYS: no surplus can ever form, and growth
itself deepens the deficit. Commerce (workshop base 2, staffing-free) is
therefore structurally mandatory - yet unreachable from the canonical
start: the first workshop needs water stock (a well first) plus 30 money,
by which point upkeep has eaten the treasury. Step019 measured the
bootstrap trap (pop1/money0, 3000 ticks). This step measured the same
trap at D2 scale: D2 + current rules stagnates at pop10/money0 with zero
techs (row A below).

## 2. Recommended opening progression

Foundation (day-0, self-sufficient, no commerce needed):
- D2 day-0 composition: 10 population, 10 residences, 5 farms, 5 wells,
  2 workshops with roads, stocks food 60 / water 40 / money 100.
  Rates dictate the counts: 10 mouths need 10 food + 10 water per tick;
  producers yield 2. The 2/2 variant starves at tick ~11 (measured).
- Residence upkeep exemption (same predicate shape as the Step004 anchor
  exemption): housing is infrastructure, not industry. This is the single
  structural change. Everything else is composition.

Specialization (surplus deployment, player-driven order):
- Bank-to-400 discipline, then the three Age-1 techs back-to-back
  (tre200 must hold at advance), lumber camp -> planks -> quarry,
  park against workshop emissions, food-triage mothballing
  (rest water/wood/stone getters when food < pop+4 so workers flow
  deterministically to farms; staffing is greedy over sort order).

Commerce (unlock-gated growth engine):
- Workshop base floor (2/tick) flows only at population >= 8: a
  settlement trades. Explicit, observable, one-line gate.
- Plank throughput bonus and tradeRoutes boost stay always-on
  (production-linked; the camp chain already gates them).
- Age-2 market converts surplus food (Step017, unchanged).

Why this shape: Foundation balances WITHOUT commerce (tax 10 +
exemption relief vs 12 producer upkeep, mothball-cycled to surplus);
commerce accelerates instead of rescuing. The player never needs a
workshop to survive the opening, but wants workshops to grow.

## 3. Alternatives considered (all measured, 1500-tick D2 runs, seed step020)

Conclusion first: only B and F2 complete Age 1 (ready@140, advance@140,
market@155, techs3, zero wipes, minMoney 100).

- A-base (D2 + current rules): pop10/money0/techs0, never ready.
  Stagnation, not crash: money-0 upkeep clamp coasts forever.
- B-resExempt (A + residence upkeep exemption, emulated by ledger):
  ready@140, age2@140, market@155, money 8506 at t1500. VIABLE.
- C-commerce3 (A + commerce base 2->3, emulated): identical to A.
  Rate is inert when the engine is unaffordable. Rejected.
- D-treasury250 (A + 250 start): identical to A (spent, then pinned).
  Injection alone fails. Rejected.
- F-lockCommerce (B + full base lock behind tradeRoutes): money 6 flat,
  techs0. The lock eats the surplus that would fund the unlock:
  catch-22. Rejected.
- F2-popGate (B + base floor gated on pop>=8, throughput always on):
  identical to B (gate transparent at D2 scale, binds only sub-8).
  RECOMMENDED gate: satisfies the unlock requirement with zero cost
  on the viable line.
- B-crisis (B + money0/food8 injected at t300): zero wipes, money back
  to 8976, advance unaffected. Recovery path confirmed: mothball coast
  (Step009) + Center trickle (Step015).

Governor lessons recorded for implementation: build from staffed
capacity deficit, never from stock dips (late-built workplaces sort
last = unstaffed = permanent upkeep for nothing); priority lists must
fall through on failure (an else-if chain froze below a water-locked
workshop branch - Stall #4); bank before tech runs.

## 4. Difficulty contract (conceptual; numbers in implementation)

- Normal: this contract exactly.
- Easy: same structure, softer pressure (larger starting stocks and
  treasury, slower pollution pace). Must not mask defects: same gates.
- Hard: same structure, sharper pressure (tighter stocks/treasury,
  faster pollution, same rules). Difficulty from pressure, never from
  changed mechanics.
- Custom sliders: deferred until presets validate.

## 5. Acceptance criteria (measurable, for the implementation step)

- Governor from the D2 composition reaches milestones-ready and advances
  within 1500 ticks; minMoney stays > 0; zero starvation wipes.
- Commerce floor reads 0 while pop < 8 (unit test) and > 0 at D2 scale.
- Crisis injection (money 0 + food 8) recovers without wipes
  (mothball + trickle path).
- Determinism (double-run equality), per-tick invariants, save round-trip
  mid-run and at end, full unit suite + lint + typecheck + build green,
  E2E 12/12 unbroken.

## 6. Exact implementation scope (next approved step)

- src/domain/economy/economy.js: extend the maintenance exemption to
  residences (isMaintenanceExempt); gate the workshop base floor on
  population >= 8 (MIN_POP_FOR_COMMERCE); stats already read the same
  helpers (Step017 honest-commerce work carries over).
- src/domain/simulation/state.js: compose the D2 day-0 colony in
  createInitialState (deterministic placement, granted free).
- No save migration (no state shape change; old saves unaffected).
- tests/selfplay.test.ts: D2 start, full-loop assertions to advance +
  market, savings/bank governor, crisis case.
- Unit tests: exemption arithmetic, pop gate on/off, D2 composition.
- Docs: game/02-MVP D2 detail (composition + exemption + gate),
  Step021 implementation report, STATE deltas.

## Open questions (explicitly NOT decided here)

- Exact Easy/Hard numbers (see 4).
- Growth past pop ~12 needs staffed well capacity > pop (water-0
  equilibrium freezes admission); Age-2 + yield techs are the intended
  lever, unmeasured end-to-end.
- Whether the market plank gate (Step006) stays the right Specialization
  hurdle once wood flows (no evidence either way yet).

## Hypotheses (labeled, unproven)

- A human-readable economy panel (income vs upkeep breakdown) would make
  the Foundation tradeoff legible; UI scope belongs to implementation.
- tradeRoutes-first research may dominate optimal play; acceptable
  (tech choice with opportunity cost).
