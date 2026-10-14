# Step023 — A1 Progression Depth Design

Baseline: `8fdaeba` (Step022). DESIGN-ONLY: no `src/` changes, no
constants, no save changes, no new dependencies in this step.

## 1. Current progression baseline (measured, not proposed)

- Ages: 1 "Age of Founding", 2 "Age of Expansion" (`content/progression.ts`).
- Age-1 milestones: pop8 / bld8 / tre200 / tech3. Age-2 milestones:
  pop15 / bld14 / tre600 / tech5. All evaluated from canonical facts;
  advancing requires the full set; transition is player-triggered via
  `advanceAge` (no cost, nothing reset).
- Techs: 5 total, additive stacking effects (farmFood, quarryStone,
  workshopCommerce); 3 × age-1 at 50, 2 × age-2 at 150; one-shot,
  age-gated research. Techs are never lost (ratchet).
- Measured loop (Step021/022 self-play, D2 start): ready@185,
  age2@185, pop12@218, market-built@326, market-sale@327, pop22@t450
  with water in surplus, treasury → 3704 by t1500. Crisis
  (money 0 + food 8) absorbed with zero wipes; full double-run
  determinism.
- UI already renders milestones with value/threshold + done marks,
  research buttons with costs, and the advance button exactly when
  `canAdvanceAge` holds (`src/app/ui.ts`, `src/app/main.ts` —
  data-driven from `evaluateMilestones`, no per-milestone UI code).

## 2. Proposed MVP age sequence and transition contract

MVP ships exactly TWO ages (07-PROGRESSION §10; "additional ages" is
post-MVP frontier item 8). No Age 3 content in A1.

- **Age 1 — Founding.** Problem set: food/water/housing viability plus
  earning the economy (treasury) and the tech base. Milestones
  unchanged: pop8 / bld8 / tre200 / tech3.
- **Age 2 — Expansion.** Problem set: growth at scale, trade footprint,
  yield depth (irrigation/deepMining staffing slack), pollution at
  scale. Milestones: pop15 / bld14 / tre600 / tech5, PLUS one addition:

**Addition (the single A1 content change): `market1` — "1 operational
market".** The current Age-2 set is "Age 1 but bigger" with no
age-specific goal; Phase 9 gates on age-specific optimization, and the
market chain (camp → wood → planks → market → sales) is the validated
Age-2 decision path (Step022). Form chosen deliberately as an
*operational-market count*, not cumulative sales: sales are events and
would need a persisted counter (state shape change + migration); a
count derives from the buildings record like every other dimension, so
**no save migration is required**. Mothballing the market un-completes
the milestone, consistent with existing `isActive` semantics everywhere
else. Implementation: optional `buildingType` filter on
`MilestoneDefinition` + one branch in `milestoneValue`; UI renders it
with zero new UI code.

Explicitly kept, not changed:
- Full-set gating + free player-triggered advance (07 §3–§4).
- pop8/bld8 satisfied by D2 on day 0. This is intended, not an
  oversight: the player-earned half of Age 1 is economic (tre200) and
  technological (tech3) — the binding pair measured at ready@185.
- tech5 = research everything. MVP-level choice lives in research
  order and timing (opportunity cost per 50), not in skipping; 07 §5
  ("most technologies eventually obtainable") holds. Cutting to tech4
  for forced specialization was considered and rejected: no evidence
  demands it, and it would shrink the validated set.
- Techs never lost; advance costs nothing and resets nothing.

## 3. Measurable pacing targets and rationale

Canonical unit is ticks (deterministic; experienced through the 1x–8x
time controls). Bands carry ~2x headroom over the single measured
governor run below; thresholds are absolute achievements, so ANY
strategy counts — the governor is an existence proof, not the tuning
target:

| Gate | Measured | Acceptance band |
|---|---|---|
| Age-1 ready (tre200 + tech3) | t185 | ≤ 400 ticks |
| Market built | t326 | ≤ 700 ticks |
| Age-2 set complete (incl. market1) | extrapolated | ≤ 1500 ticks |
| pop ≥ 20 with water > 0 | t450 / t1500 | within budget |

Rationale: banking-to-400 funds the back-to-back tech run with tre200
intact at advance; market timing follows the wood chain
(~4-tick project once staffed); treasury scales ~+6/tick in the
sustained run, so tre600 is reached long before the budget end.
The Age-2 band is the only extrapolated row — implementation must
measure, not assume it.

## 4. Recovery and exploit considerations

- Crisis delays, never deadlocks: treasury dips un-complete tre200 /
  tre600 (re-earned by surplus); wipes reset pop (regrows); mothballing
  removes buildings from bld counts (reactivation restores); techs
  persist. Every milestone value is recoverable with existing
  mechanics — mothballing (Step009) and the Center trickle (Step015).
  No injections, per standing precedent.
- All-or-nothing wipe at scale is severe-but-understandable (03 §6,
  rule 21: legible via forecast balance + alerts, which already exist).
- Exploit audit against the one new rule (market milestone counts
  operational markets): build-mothball cycling changes nothing (mothball
  only un-completes); demolition removes the count (no refund, so no
  farm loop); gate timing reads settled post-tick state (commands
  cannot move pop or buildings counts mid-tick — placement still needs
  ticks to mature). No new exploit surface: the milestone reads the
  same `isActive` predicate as upkeep, commerce, and staffing.

## 5. Required player feedback (reuse; no redesign)

- Progression panel already shows each milestone as
  `label value/threshold` + done mark, research buttons with costs, and
  the advance button exactly when available. The market milestone
  appears there with no UI code. Undone rows ARE the blocked reason
  by construction; treasury is in stats; food outlook in forecast.
- Market discoverability already verified (Step022): hidden until Age 2
  via `requiredAge`, cost label shows `50$ +2pl`, Planks stat row
  exists, inspection text states the rule, staffing/deposits overlays
  expose the chain's state.
- Explicitly deferred (recorded Step022 gaps, not A1 scope): staffing
  ORDER is undiscoverable; mothball-as-staffing-lever is unguided; the
  hidden market button gives no "requires Age 2" hint.

## 6. Acceptance tests and implementation boundaries

Deterministic scripted governor on the existing self-play harness
(no parallel simulator):
- D2 → ready ≤ 400 → advance (round-trip save) → market-built ≤ 700
  → full Age-2 set incl. market1 ≤ 1500 → save round-trip.
- Crisis injection mid-Age-2 (money 0 + food shortfall): milestones
  un-complete → recover → re-complete, no injections after setup.
- Double-run state + phase equality.
- Save/load: no migration expected (derived milestone); round-trip at
  each transition proves it; full unit + lint + typecheck + build
  green; E2E full-loop scenario only if player-visible behavior
  changes (none planned).
- Pollution watch-item: pop15 needs sustained quality ≥ 25; the
  governor's park logic held quality 38 at t1500 — assert quality
  never blocks admission for more than N consecutive ticks in the
  acceptance run (exact N measured at implementation time).

Boundaries: content (`progression.ts` market milestone) + one domain
branch (`milestoneValue`) + tests + governor extension. No new
resources, buildings, systems, energy, services, or difficulty
architecture. No Easy/Hard numbers.

## 7. Risks, open decisions, GO/NO-GO

Risks:
- Pacing bands rest on one governor strategy (mitigated: ~2x headroom,
  absolute thresholds; Age-2 band must be measured, flagged above).
- Governor strategy monoculture in tests (accepted: assertions pin
  achievements + determinism, not playstyle).
- pop8/bld8 free on day 0 compresses Age 1 into economy+tech (accepted
  deliberately — see §2; revisit only with playtest evidence).

Open decisions (none blocking):
1. Staffing-order visibility / triage guidance (UI slice candidate).
2. Exact-balance water fragility accepted as-is (recovery exists).
3. Single-park absorption pacing vs multi-emitter colonies (observable,
   player-resolvable; monitor in acceptance).
4. tech5-equals-everything (kept; specialization-order choice suffices
   for MVP).

Dependencies genuinely blocking A1: **none found.** Staffing,
pollution, and collapse behaviors all have player-coherent,
mechanic-internal responses that the acceptance suite exercises;
milestones re-earn after every setback class.

## GO / NO-GO for A1 implementation

**GO.** The contract is minimal (one milestone + one domain branch),
fully testable with existing harnesses, migration-free, and every
gate is evidenced or explicitly flagged for measurement at build time.
Recommended implementation order: milestone content + domain branch →
governor extension (tech run → advance → market → Age-2 set) →
crisis/pollution acceptance cases → docs sync.
