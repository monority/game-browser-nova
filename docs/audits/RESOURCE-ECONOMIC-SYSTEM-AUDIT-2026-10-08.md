# NOVA — Resource & Economic System Audit (2026-10-08)

Audit of the `Ressources → Extraction → Transformation → Construction →
Économie` system against the validated baseline `2ea8a0b` (Step002 money
suite). **Audit only — no gameplay code was modified.**

## Executive Summary

- The current model has **no SOURCE stage at all**: there are no natural
  resources in the world (terrain is only `blocked` cells), no extraction,
  and no transformation. The Workshop "produces" money (commerce) from
  nothing; construction is paid from money, not from physical materials.
- The pipeline is therefore `MONEY → BUILDING → FLOW (food/water/commerce)
  → POPULATION → TAXES → MONEY` — a closed monetary loop with a food/water
  survival layer, not a resource pipeline.
- **Self-lock verdict: PARTIAL.** One structural terminal state exists
  (population 0 with food 0 — unrecoverable in the current model), one
  economic stall is already documented (D1: net-negative baseline), and
  buildings being permanent (no demolish) makes over-building a permanent
  maintenance burden. Everything else recovers.
- The validated product direction (physical resources, extraction,
  transformation, Colony-Center bootstrap) is **compatible with the current
  architecture** and can be added incrementally without a rewrite: the
  canonical-state patterns (blockedCells, storage hub, flat resource record)
  all extend additively.
- Decisions D1–D8 are recorded below. Nothing is implemented in this step.

## Current Architecture

### Canonical state (`src/domain/simulation/state.ts`)

| Field | Type | Notes |
|---|---|---|
| `resources` | `{ food, money, water }` | flat record; money clamped ≥ 0; food/water clamped ≥ 0 |
| `storage` | `StorageHub` | food/water capacities — **dormant** (never read by the tick phases) |
| `buildings` | `Record<id, Building>` | 4 types: `residence / farm / workshop / well`; 2-tick construction; permanent (no demolish command exists) |
| `roads` | `Record<id, Road>` | 5 money/cell; no maintenance; permanent |
| `colonists` | `Record<id, Colonist>` | aggregate colonists, 1 job each |
| `config.world` | `{ seed, width, height, blockedCells? }` | terrain's ONLY concept is `blocked` — no deposits, no fertility |

### Tick pipeline (`src/domain/simulation/phases.ts`)

```text
1. advanceConstruction   under-construction → operational
2. updateNeeds           food requirement = population
3. produceFood           staffed farms +2 food/tick
4. water phases          staffed wells +2/tick; all-or-nothing consumption
5. updatePopulation      starvation removes ALL colonists; admission while food > 0
6. assignJobs            deterministic nearest-eligible workplace
7. collectRevenue        1 tax/inhabitant + 2 commerce per CONNECTED Workshop
8. payMaintenance        1 money per OPERATIONAL building (vacancy included)
+ settlement growth      only active at Town stage
```

Commands (the complete list): `placeBuilding`, `placeRoads`,
`reassignColonist`, `assignConstructionCrew`. No removal commands.

### The actual flow map (§14 of the mandate)

```text
SOURCE         ✗ does not exist (no deposits, no fertility, no world resources)
TRANSFORMATION ✗ does not exist (Workshop converts nothing — it emits commerce)
STORAGE        ~ dormant (StorageHub persisted but never read by the tick)
CONSUMPTION    ✓ food 1/colonist/tick (all-or-nothing), water 1/served/tick
CONSTRUCTION   ✓ money 25/building + one-off water (workshop), atomic placement
ECONOMY        ✓ revenue 4 typical vs maintenance 4–5: net ≈ 0 to −1/tick (D1)
```

Per-step detail:

| Stage | Data | System | Command | Invariant | Deadlock risk |
|---|---|---|---|---|---|
| SOURCE | — | — | — | — | **no source stage exists** |
| TRANSFORMATION | — | — | — | — | **no transformation exists** |
| STORAGE | `storage` | `domain/storage` | — | never read by the tick | dormant code, must be wired or consciously parked |
| CONSUMPTION | `resources.food/water` | `phases.consumeFood/consumeWater` | — | all-or-nothing; starvation exhausts the stock | starvation removes the whole population |
| CONSTRUCTION | `resources.money` | `validatePlacement` + atomic dispatch | `placeBuilding`, `placeRoads` | same-tick revenue may complete a shortfall; water shortfall never covered | money 0 + net ≤ 0 = construction freeze |
| ECONOMY | `resources.money` | `collectRevenue`, `payMaintenance` | — | money never negative; revenue lands before commands | net-negative shapes never accumulate (D1) |

## Validated Product Principles

From `docs/game/08-RESOURCES.md` (MVP 5–10 resources + money; short chains;
resource continuity), `docs/game/06-WORLD.md` (regions incl. mineral-rich),
`docs/game/10-VISUAL-DIRECTION.md` (trees/vegetation visible), and this
mandate: resources are physical, finite, visible, multi-use; extraction ≠
transformation; the Colony Center is a bootstrap safety net, not an economy;
fertility is a future direction; houses evolve beyond population +
maintenance. None of these have code support yet beyond the food/water/money
triad.

## Resource Model

Current: 3 resources — `food` (renewable, farm-produced, consumed
all-or-nothing), `water` (renewable, well-produced, served-colonist
consumption), `money` (treasury, uncapped, clamped ≥ 0). The historical
`material` stock was removed in Step001: **construction is paid from money**,
so no physical good is consumed by building anything.

## Extraction Model

Does not exist. The Farm and the Well are self-standing producers: they
consume no input and draw from no world entity. Food and water are strictly
renewable and infinite — nothing in the world depletes.

## Transformation Model

Does not exist. The Workshop's output is `commerce` — 2 money/tick for being
operational and road-connected, independent of staffing, inputs, or anything
physical. A factory that creates value from nothing is exactly what the
product principle "a plant never creates a primary resource from nothing"
forbids; today's commerce is a **subsidy mechanic**, not a transformation.

## Storage Model

`StorageHub` (Step 10BG) holds food/water capacities and is persisted with
explicit save migrations that always re-create it empty. The tick phases
never read or write it (`grep` clean), so it is dormant scaffolding. The
colony stocks themselves are uncapped.

## Economy Model

Revenue = 1 tax/inhabitant + 2 commerce per connected Workshop (vacancy
included, staffing-independent). Maintenance = 1 per operational building
(roads excluded). The treasury is uncapped and clamped ≥ 0; same-tick revenue
can complete a construction shortfall. The validated baseline is net-negative
in several shapes (D1 finding from Step002): revenue 4 vs maintenance 5 for a
2-colonist village with a Workshop.

## Self-Lock Analysis

**Verdict: PARTIAL.**

### Lock 1 (structural, TERMINAL): population 0 with food 0

Starvation is all-or-nothing: when `food < population`, `consumeFood`
exhausts the stock to 0 and `updatePopulation` removes every colonist in the
same tick (`phases.ts:1011-1013`, `:815-818`). Admission requires
`resources.food > 0` (`phases.ts:1018`). Food production requires a *staffed*
farm, which requires a colonist. With population 0 and food 0 the colony can
never re-admit anyone — **permanently terminal**. This is reachable through
normal play: the housing-composition E2E deliberately demonstrates it
("stranded failure: population 0 at tick 22, objective failed"), and
scenarios declare `failsWithoutColonists: true`. Under the current design it
is an intended fail state; under the mandate's anti-self-lock direction it is
the defect the Colony Center (§6) exists to fix. It is the single terminal
lock in the model.

### Lock 2 (economic, PARTIAL): money 0 with net ≤ 0

The D1 baseline (Step002) leaves several shapes unable to accumulate. The
recovery path exists but is conditional: commerce (2/connected Workshop)
flows without staffing and Workshops are permanent, so revenue never drops to
zero once one is connected; taxes return with any admitted colonist (admission
needs food > 0 only — the water gate has a bootstrap exemption for the first
colonist, `phases.ts:1035-1041`). A colony whose maintenance outruns its
revenue floor stays at money 0 forever — a construction freeze, but not death:
existing farms/wells keep the survivors alive. Verdict: recoverable in
principle, unreachable in measured shapes — this is the documented D1 finding.

### Lock 3 (capacity, NONE): buildings and roads are permanent

No demolish command exists. Production capacity can never be destroyed — the
classic "spent everything, lost my means of production" lock cannot happen
through removal. The inverse is true though (see Findings #4).

### Not applicable yet

Resource depletion (no deposits), chain misuse (no chains), obsolescence (no
tech). The §C/§D/§G scenarios cannot lock because their subjects do not
exist; they become design requirements for D1–D3 below.

## Day-0 Analysis (Scenario A)

Day 0 today: treasury 100, food 100, water 0, no colonists, no buildings.
The loop opens correctly: residence (25) admits a colonist from the food
stock → taxes start → farm/well/workshop follow. No circular dependency: food
production needs only money + a colonist, both available at tick 3. The
water gate's bootstrap exemption admits the first colonist even with 0 water
production. With 10 starting colonists and a Colony Center (mandate §1/§6)
the shape is unchanged — the Center only needs to exist and carry the
primitive collection.

## Environment / Fertility

The terrain model is a `blockedCells` list (Step 10AV) — the smallest
canonical form. Adding fertility later is additive: a new optional canonical
field keyed by cell (or per-region) follows the exact pattern already
established by `blockedCells` and the storage migrations. No loop is created
because farms currently draw no input from the land; when fertility arrives,
the farm contract gains an input read, not a structural change.

## Houses / Population Compatibility

The housing contract (capacity 1/residence, food-gated admission, water
coverage gate) is independent of the resource layer. Future house evolution
(services, per-residence needs, value) can stay **derived**: nothing in the
resource/economy plan requires persisted per-residence state. The one
contract to preserve: admission is food-gated and water-coverage-gated, and
the first admission is bootstrap-exempt from the water headroom.

## Findings

1. **Terminal lock: population 0 + food 0 is unrecoverable.** Intended as a
   fail state today; the Colony-Center primitive collection (D4) must
   explicitly supersede it before physical-resource mechanics land.
2. **D1 net-negative baseline** (carried from Step002): several colony shapes
   never accumulate; commerce is currently the only staffing-independent
   revenue, which masks the problem rather than solving it.
3. **StorageHub is dormant**: persisted, migrated, never read by the tick.
   Either wire it when the first physical good ships or remove it; leaving it
   half-alive is a maintenance trap.
4. **No demolish/removal command**: over-building permanently worsens the
   net flow (every operational building pays 1/tick forever) and mistakes
   cannot be corrected. Relevant to both Lock 2 and the mandate's "mauvais
   investissement" scenario.
5. **The Workshop contradicts the transformation principle**: it emits
   commerce from nothing (no input, no staffing). Any physical-resource
   architecture must eventually re-anchor commerce to delivered goods.
6. **No world resources**: the validated "geography has an economic function"
   direction has zero code support — terrain is only `blocked`.

## Decisions

### D1 — Resource model
Keep the flat canonical `resources` record and extend it per-resource when
the first physical good ships (`wood`, then `stone`) — no generic
`ResourceEngine`. Add natural **deposits** as canonical world state (cell-keyed
`{ type, amount }`), mirroring the `blockedCells` pattern exactly. MVP set:
wood, stone, water-source, fertile soil (implicit), food, money.

### D2 — Extraction
Extraction = staffed buildings adjacent to a deposit, producing an aggregate
deterministic yield/tick and decrementing the deposit. Deposit exhaustion
empties the deposit (cell remains, visually depleted). No per-worker
simulation; the existing staffing/access rules (road access, nearest-eligible)
apply unchanged.

### D3 — Transformation
Workshops (and future mills) consume raw inputs → produce goods. Commerce is
re-anchored progressively: first to delivered goods at the Workshop, keeping
the 2/tick number as the migration stepping stone. The Step001 commerce
contract is preserved until the first raw resource actually ships.

### D4 — Bootstrap (anti-self-lock)
Build the **Colony Center** with a small unstaffed primitive collection
(low-rate wood + food trickle). Invariant to implement and test: *every
fundamental resource always has ≥ 1 recovery path reachable with the
colony's already-acquired capabilities*. This supersedes the population-0
terminal lock: the Center's food trickle re-seeds admission without
colonists. The Center replaces today's implicit "initial stock is the only
safety net".

### D5 — Storage
Reuse the dormant `StorageHub` as the single per-resource capacity structure
when the first physical good ships; until then, park it consciously (document
it as reserved) or remove it from the save if the migration burden grows.
Do not build new storage mechanics now.

### D6 — Economy
Keep taxes and per-building maintenance unchanged. Re-anchor commerce to
transformation throughput (D3) rather than existence. Deficit remains a
legitimate investment state; the invariant is "a realistic path to
equilibrium exists", not "net ≥ 0 always". The D1 baseline question (is
net-negative by design?) is a product decision that MUST precede any
commerce re-anchoring.

### D7 — Environment
Deposits are finite by default (D2). Fertility: reserve the concept, do not
implement; when it lands it is an additive canonical terrain field. Water
sources: treat the Well as drawing from an implicit infinite aquifer until
the first water-scarcity design exists.

### D8 — Houses
Preserve the housing/admission/water-coverage contract unchanged. Future
per-residence evolution must remain derived state. No contract change needed
by the resource layer.

## Deferred Work

- Colony Center implementation (D4) — next implementation step.
- Deposit world generation + first extraction building (D1/D2).
- Workshop commerce re-anchoring (D3/D6) — blocked on the D1 product
  decision (net-negative by design or not).
- StorageHub activation or removal (D5).
- Fertility model (D7) — product direction only.
- Demolish/removal command — needed before "mauvais investissement" recovery
  is fully player-controllable.
- Population-0 recovery rule: either the Colony Center (D4) or an explicit
  "colony failed" product ruling.

## Recommended Implementation Sequence

1. **D1+D2 vertical slice**: wood deposits + Lumber Camp producing raw wood
   (finite deposit), one unit test of the deposit-depletion invariant.
2. **D4 Colony Center** primitive collection + the anti-self-lock invariant
   test (population-0 recovery proof) — this retires the terminal lock.
3. **D3 first transformation**: Workshop consumes wood → delivers goods →
   commerce becomes throughput-derived (gated on the D1 product decision).
4. **D5** storage activation for wood (reuse StorageHub).
5. **D7** fertility — only after the above stabilizes.
6. Demolition command — before or with 2, product decision.

Each step keeps `vitest`/E2E green per the established gates; no step starts
without its decision validated against the repository.

## Validation

Audit-only pass — no code modified.

| Check | Command | Result |
|---|---|---|
| Baseline unchanged | `git status` | only this audit doc untracked |
| Baseline commit | `git log -1 --oneline` | `2ea8a0b feat(nova): finalize Step002 money suite` |
| Prior gates | Step002 finalization (same day) | tsc/eslint PASS, vitest 1877/1877, build PASS, E2E 336/336 |
