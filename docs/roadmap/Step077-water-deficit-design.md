# Step 077 — Water deficit: technical design sheet

**Status: design only. No code was modified, no commit, no push.**
Every statement below is tagged:

- **VERIFIED** — read in the code and/or replayed through the real pipeline;
- **DERIVED** — arithmetic consequence of verified code, computed by hand;
- **PROPOSAL** — design choice, not implemented;
- **EXPERIMENTAL** — coefficient or threshold that no measurement supports yet.

Measurements were made with the existing headless cockpit
(`tools/agent/run.mjs`, real `applyCommand` + `stepTicks`) driven by JSONL
scripts written **outside** the repository (`/tmp/*.jsonl`). Nothing in the
working tree was touched by the measurement itself.

---

## A. What actually exists

### A.1 Water life cycle in one tick

`src/domain/simulation/tick.ts:66-110`, phase order:

| # | Phase | Water effect |
|---|---|---|
| 1 | `advanceConstruction` | — |
| 2 | `produceWater` (`tick.ts:74`) | `stock += staffed active wells × waterPerWell` |
| 2′ | `produceFood` (`tick.ts:72`) | — |
| 5a | `applyFoodSpoilage` (`tick.ts:79`) | — (food only) |
| 5b | `consumeWater` (`tick.ts:84`) | `served = min(stock, population)`, `stock -= served` |
| 6 | `clampStorage` (`tick.ts:86`) | `stock = min(stock, waterCapacity)`; surplus destroyed |
| 7 | `updatePopulation` (`tick.ts:88`) | admission gate reads `stock > 0` |
| 8 | `updateEnvironment` | — |
| 9 | `assignJobs` | next tick's staffing |
| 10 | economy | upkeep of active wells (`1/tick` each) |
| 11 | `resolveEvents` | expires the drought affecting the *next* tick |

**VERIFIED.** Consequences that matter for the design:

1. Production is added **before** consumption, so the tick's own availability
   is `S + P` where `S` is the stock at the start of the tick. The document's
   `R = min(1, (S + P) / C)` is therefore **compatible with the pipeline as
   it stands** — it is the quantity the tick already uses, not a redefinition.
2. The clamp runs **after** consumption, so it can never eat water a colonist
   would have drunk. No double counting in either direction.
3. `consumeWater` returns the served count (`production.ts:141-145`) and
   **the tick discards it** (`tick.ts:84`, no assignment). The shortage signal
   exists, is computed every tick, and is thrown away.

### A.2 Where the numbers come from

| Quantity | Home | Value |
|---|---|---|
| Well output | `production.ts:17,99-104` | `2/tick`, `1` under drought |
| Per-colonist need | `production.ts:19` | `1/tick` |
| Effective production | `production.ts:109-117` | sum over **active + staffed** wells |
| Served | `production.ts:141-145` | `min(stock, population)` |
| Water capacity | `storage.ts:26,39-41` | `80` base (`D2_WATER × 2`) + `40`/warehouse |
| Upkeep of a well | `economy.ts:48,95-97,109-116` | `1 money/tick` while active |
| Staffing priority | `jobs.ts:35-39` | farm `0` → well `1` → everything else `2` |
| Road requirement | `jobs.ts:20-26` | a workplace is staffable only if orthogonally road-adjacent |
| Placement cost | `buildings.ts:73`, `placement.ts:69` | workshop costs `1 water`; refused if `water < 1` |

### A.3 Growth admission, in full

`population.ts:33-48`, in this order:

1. **Starvation** — if `fed < population`, `pop -= 1` (`:34-36`).
2. **Admission**, one colonist per tick, all four conditions ANDed:
   - `population < housingCapacity(state)` (`:39`)
   - `resources.food > 0` (`:40`)
   - `population === 0 || resources.water > 0` (`:41`) ← **the defective rule**
   - `population === 0 || environmentalQuality >= 25` (`:44`)

**VERIFIED.** The water condition tests the **residual stock after
consumption**, not the coverage. A colony whose wells produce exactly what its
colonists drink ends every tick with `water === 0`, so it fails this test
forever while every colonist is served.

### A.4 The coverage law already exists — in the alert

`analysis.ts:242-245`:

```
waterServed = min(water + waterProductionPerTick(state), population)
alert if waterServed < population  →  "Water: 10/11 colonists served"
```

**VERIFIED.** `(stock + production) / need` — i.e. the target `R` — is already
implemented, once, as an alert. The simulation gate below it uses a different
rule (residual stock). The two disagree, and the alert is the one that is
right.

### A.5 State and persistence

- `GameState` (`state.ts:14-53`) holds facts only: `resources`, `population`,
  `pollution` (int 0–100, persisted), `foodSpoilCarry` (fraction, persisted),
  ages, events. **No water pressure field exists.**
- `createInitialState` (`state.ts:55-84`) sets `pollution: 0`,
  `foodSpoilCarry: 0`; a new water field belongs in the same list.
- Saves: `SAVE_VERSION = 19` (`save.ts:32`), migratable from 13
  (`MIGRATABLE_SAVE_VERSION`), sequential chain `save.ts:120-126`, one
  migration per added field. Precedent for an integer bounded stock:
  `migrateV14ToV15` adds `pollution: 0` (`save.ts:412-418`). Precedent for a
  validated range: `foodSpoilCarry` rejected when `>= 1`
  (`save.ts:186-192`).
- `resources.water` is validated as a non-negative number (`save.ts:179`).

### A.6 Forecasts and UI that already read water

| Reader | Formula | Note |
|---|---|---|
| `getResourceSummaries` (`analysis.ts:110,122-132`) | `production − consumption`, `ticksRemaining = floor(stock / −balance)` | no coverage notion |
| Alert "served" (`analysis.ts:242-251`) | `min(stock + production, pop) < pop` | **the correct law** |
| Alert "storage full" (`analysis.ts:285-291`) | `stock >= capacity && balance > 0` | unrelated |
| Overlay (`overlay.ts:46-49`) | `production − pop` | **duplicate** of `analysis.ts:110` |
| Stats panel (`statsPanel.ts:122`) | `water / waterCapacity` | stock only |
| `plan` tool (`tools/agent/play.ts:377`) | water ceiling `= floor(productionPerTick)` | already assumes `pop = P` is sustainable |

**VERIFIED duplication:** the balance formula exists twice (`analysis.ts:110`,
`overlay.ts:47`) — same expression, two homes.

---

## B. Gaps

| # | Current behaviour | Expected behaviour | Root cause | Gameplay consequence |
|---|---|---|---|---|
| G1 | Exact balance (`pop = 2 × wells`, stock 0) freezes growth permanently | coverage 100 % admits | `population.ts:41` tests `stock > 0` | Colony stops one colonist below its true water capacity, silently |
| G2 | No alert in that state | a state must be readable | served `==` pop, so `analysis.ts:246` is false | Measured `alerts: none` while growth was frozen 400 ticks |
| G3 | Shortage has no consequence at all | progressive pressure | `tick.ts:84` discards `served` | Mothballing wells is free money (measured below) |
| G4 | No coverage/pressure anywhere in state | one persisted indicator | field absent | Save/load can never reproduce a crisis; UI cannot show one |
| G5 | Planner and tick use different water laws | one law | `play.ts:377` uses production, `population.ts:41` uses stock | Planner promises `pop = P`, tick admits past it while a store exists and stalls exactly at it |
| G6 | Building a well at exact balance adds nothing | a new well must add water | `jobs.ts:50-55` staffs `population` workplaces; farms take workers first | Measured: 25 $ spent, water still `0/80`, pop still `12/15`, the 7th well idle |

---

## C. Minimal target architecture

### C.1 One module, one law

New file `src/domain/water/water.ts` (domain, pure, no rendering, no queries):

```ts
export interface WaterCoverage {
  production: number;   // active + staffed wells × waterPerWell (drought-aware)
  consumption: number;  // population × WATER_PER_SERVED_COLONIST_PER_TICK
  available: number;    // stock + production  — the tick's own basis
  served: number;       // min(available, consumption)
  coverage: number;     // consumption === 0 ? 1 : served / consumption
  balance: number;      // production − consumption
  state: "balanced" | "light" | "severe" | "recovering";
  pressureDelta: number;
}

export function waterCoverage(state: GameState): WaterCoverage; // pure
export function updateWaterPressure(state: GameState): number;  // tick phase
export function waterAdmissionGate(state: GameState): {
  served: number; consumption: number; covered: boolean; state; pressure;
}; // mirrors environment.admissionGate (environment.ts:112-131)
```

Responsibilities:

- `waterCoverage` — **the only place** that divides water. `analysis.ts`
  (summaries + alert), `overlay.ts`, `stats.ts`, `statsPanel.ts` and `plan`
  read it; none re-derives.
- `updateWaterPressure` — the only writer of `state.waterPressure`.
- `waterAdmissionGate` — the read the population phase and the UI share,
  exactly as `admissionGate` already does for air.

### C.2 Tick integration (no double counting)

Production and consumption are **measured as deltas by the pipeline**, the way
food already is (`tick.ts:71-84`):

```
const waterBefore = state.resources.water;
produceWater(state);
const waterProduced = state.resources.water - waterBefore;   // exact, drought-aware
...
const waterServed = consumeWater(state);                     // already returned
...
updateWaterPressure(state, { produced: waterProduced, served: waterServed });
```

- `consumption` = `state.population` **at the moment of consumption**.
- `available` = `waterBefore + waterProduced`.
- `served` = the value `consumeWater` really removed.
- The clamp runs later and cannot affect any of these.

This is the same argument as `TickFlows` (`tick.ts:13-31`): report what the
phase moved, never a re-derivation that could drift.

### C.3 Growth gate

The only change in `population.ts`: take the measured served count and replace
`line 41`.

```ts
updatePopulation(state, fedColonists, servedWater)   // servedWater from phase 5b
...
(state.population === 0 || servedWater >= state.population)
```

Why this and not `waterCoverage(state)` recomputed inside the phase:
after phase 5b the stock no longer holds the production, so a re-derivation
there would **double count** (the document's own warning). `servedWater` *is*
`min(S + P, C)`: measuring it is the only form that cannot drift. The
comparison uses the post-starvation population (starvation is applied at
`population.ts:34-36`), which is the population that will actually live next
tick.

### C.4 Persistence

| Item | Value |
|---|---|
| Field | `state.waterPressure: number` — integer `0..100` |
| Initialisation | `createInitialState`: `waterPressure: 0` |
| Save | `SAVE_VERSION` 19 → **20**; `waterPressure` in `SaveDocument` |
| Migration | `migrateV19ToV20` → `{ ...document, formatVersion: 20, waterPressure: 0 }` (same shape as `save.ts:368-374`) |
| Validation | reject non-integer, negative, or `> 100` — corrupt data is not plausible state (`save.ts:186-192` discipline) |
| Derived values | none persisted: coverage, state and delta are recomputed |

**No float.** Production, consumption, stock and served are integers, so
`coverage` never needs to be stored at all — and the two class boundaries are
exact integer tests (see D.3). Pressure is an integer counter.

### C.5 What is not built

- No network, no per-building distribution, no pipe graph: production stays
  global and adjacency still only decides *staffability* (`jobs.ts:20-26`).
- No new event, no mortality, no yield change, no cost change.
- No hysteresis: the gate is the coverage of the tick, nothing else (a
  pressure-gated hysteresis would be a **new** rule — see D4 of §G).

---

## D. Definitive formulas

### D.1 Production and consumption

```
P = Σ wells (isActive(b) && b.staffed) × (WATER_PER_WELL_PER_TICK − droughtReduction)
C = population × WATER_PER_SERVED_COLONIST_PER_TICK
```

Both already exist (`production.ts:99-117`, `:19`). Nothing changes.

### D.2 Availability, served, balance, coverage

```
A = S + P                  // S = stock at the start of the tick
served = min(A, C)
coverage = C === 0 ? 1 : served / C
B = P − C
```

`A` is the tick's real basis (production precedes consumption). `B` is a
*presentation* number: it ignores the stock, so a colony can have `B < 0` and
`coverage = 1`. Both are exposed; only `coverage` decides anything.

Stock after the tick:

```
S' = min(S + P − served, waterCapacity)     // exact integer
```

### D.3 States — exact integer boundaries

| State | Test | Note |
|---|---|---|
| `balanced` | `served === C` and `pressure === 0` | coverage exactly 1 |
| `recovering` | `served === C` and `pressure > 0` | same coverage, pressure decaying |
| `light` | `4 × served ≥ 3 × C` and `served < C` | coverage `≥ 75 %`, boundary inclusive |
| `severe` | `4 × served < 3 × C` | coverage `< 75 %` |

`4·served ≥ 3·C` is the exact form of `≥ 0.75`: no float, no epsilon, and
75 % is **light** by construction. `C === 0` ⇒ `coverage = 1`, `balanced`
(doc rule, and it mirrors the bootstrap exemption at `population.ts:41-44`).

### D.4 Pressure

```
delta = served === C      ? −WATER_PRESSURE_FALL
      : 4·served ≥ 3·C    ? +WATER_PRESSURE_RISE_LIGHT
      :                     +WATER_PRESSURE_RISE_SEVERE

waterPressure' = clamp(waterPressure + delta, 0, 100)
```

Locked endpoints: `RISE_SEVERE = 2` at 0 % coverage, `FALL = 1` when covered.
The light-deficit value is **not specified** by the document; `1` is proposed
(it reuses the 75 % boundary already locked, adds no threshold). All three
coefficients remain **EXPERIMENTAL**.

Gauge thresholds 25 / 50 / 75 / 100: **EXPERIMENTAL**, display only, no effect
on any phase.

### D.5 Recovery and transitions

- The pressure falls only when coverage is complete — a colony in deficit does
  not recover while it still misses water, whatever its pressure.
- Recovery is linear at `1/tick`, so a crisis of `N` ticks at `+2` costs
  `2N` ticks to clear. Saturated pressure (100) needs **100 ticks** of full
  coverage — nearly two years of 60-tick game time. Flagged in §F.
- `served === C` with `pressure === 0` is `balanced`; there is no other way
  into `balanced`.

---

## E. Scenarios

### E.1 Measured, current code (baseline for the change)

| # | Script | Input | Observed | Verdict |
|---|---|---|---|---|
| M1 | `/tmp/w3.jsonl` | pop 12, 6 wells staffed (P 12), S 0, housing 15 | `water 0/80 (+0/tick)`, `pop 12/15`, **`alerts: none`**, "growth stalled 400 ticks with 3 housing headroom" | G1 + G2 **confirmed** |
| M2 | `/tmp/w5.jsonl` | M1 + a 7th well (25 $) | `water 0/80 (+0/tick)`, `pop 12/15`, `workforce 12/15` — the new well is never staffed | G6 **confirmed** |
| M3 | `/tmp/w2.jsonl` | pop 11, P 10 (one well unstaffed) | `Water: 10/11 colonists served`, pop **stays 11 for 400 ticks**, money keeps rising | shortage costs no life |
| M4 | `/tmp/w7.jsonl` | D2, mothball 1 of 5 wells | water `-2/tick`, `8/10 served`, pop **10/10 unchanged 100 ticks**, money net `+2 → +3/tick` | mothballing water is profitable — G3 **confirmed** |
| M5 | `/tmp/w0.jsonl` | D2 at t=60 | `water 30/80 (+0/tick)` — production 10 = consumption 10 exactly | the opening already sits on the boundary |

### E.2 The document's table, recomputed

Base `C = 86`, `S` initial as given. `covered` = `served === C`. Target column
is **DERIVED** from D.2–D.4, not simulated (the system does not exist yet).

| Scenario | P | S | A | served | coverage | state (target) | pressure / tick | Stock after |
|---|---:|---:|---:|---:|---:|---|---|---:|
| Exact balance | 86 | 0 | 86 | 86 | 1.000 | balanced | 0 | 0 |
| Light deficit | 84 | 0 | 84 | 84 | 0.977 | light | +1 | 0 |
| "Severe frontier" 64.5 | — | 0 | — | — | **unreachable** | — | — | — |
| Severe deficit | 64 | 0 | 64 | 64 | 0.744 | severe | +2 | 0 |
| Store available | 64 | 100 | 164 | 86 | 1.000 | balanced | 0 | 78 |
| Full stop | 0 | 0 | 0 | 0 | 0.000 | severe | +2 | 0 |
| Surplus | 88 | 0 | 88 | 86 | 1.000 | balanced | 0 | +2/tick, capped at 80 |

**64.5 cannot occur**: well output is an integer (2, or 1 under drought), so
production is an integer and `served` is an integer. 75 % exactly is reachable
only when `4·served === 3·C` — e.g. `C = 8, served = 6` (3 wells), or
`C = 4, served = 3` (3 wells under drought). At `C = 86` the boundary falls
between `65` (75.6 %, light) and `64` (74.4 %, severe). Acceptance must test
the boundary at a size where it exists, not at 86.

### E.3 Store draining, tick by tick (P 64, S 100, C 86)

| tick | S before | A | served | coverage | state | S after |
|---:|---:|---:|---:|---:|---|---:|
| 1 | 100 | 164 | 86 | 1.000 | balanced | 78 |
| 2 | 78 | 142 | 86 | 1.000 | balanced | 56 |
| 3 | 56 | 120 | 86 | 1.000 | balanced | 34 |
| 4 | 34 | 98 | 86 | 1.000 | balanced | 12 |
| 5 | 12 | 76 | 76 | 0.884 | light (+1) | 0 |
| 6 | 0 | 64 | 64 | 0.744 | severe (+2) | 0 |

The store buys exactly 4 full ticks, then the shortage is progressive — the
required "réserve consommée avant rupture", with no cliff until the stock is
actually gone.

### E.4 Pressure traces (DERIVED)

| Family | Coverage held | Pressure after 15 t | after 50 t | after 100 t | Reaches swing |
|---|---|---:|---:|---:|---|
| Light deficit prolonged | 0.98 | 15 | 50 | 100 | 100 ticks |
| Severe short | 0.50 | 30 | 100 | 100 | 50 ticks |
| Severe prolonged | 0.00 | 30 | 100 | 100 | 50 ticks |
| Crisis then full recovery | 0 → 1 | 30 → 15 | 100 → 50 | 15 → 0 | 50 + 100 ticks |
| Small colony (12) vs large (86) | any | identical | identical | identical | pressure is absolute, not per-capita |

### E.5 Gameplay consequences

- **The colony can now reach its real ceiling.** Today it stops one colonist
  short of `2 × wells`; under the target law it fills exactly `2 × wells`
  (M1's `pop 12` with `P 12` becomes admissible, and the next colonist is
  refused with a *visible* light deficit instead of silence).
- **Switching off wells stops being free of meaning** — growth now pauses as
  soon as coverage drops. It stays **free of cost** (no death, no yield loss),
  which is the open decision of §G-D1.
- **The deadlock of M2 is not fixed by this change** and must not be confused
  with it: at full employment a new well gets no worker. The legal exits are
  the ones the game already has (a farm-yield technology frees farm workers, a
  mothballed farm frees one at a food cost).
- **No spiral by water alone**: water shortage removes no colonist, so it
  cannot feed on itself. The real spiral in the code is the *opposite* one:
  food starvation (`population.ts:34-36`) removes a colonist, which frees a
  worker for a well, which *improves* coverage — famine self-corrects water.

---

## F. Acceptance criteria

All are testable against the existing suites; none requires a new harness.

| # | Criterion | Where |
|---|---|---|
| F1 | `coverage` is exact at 0 %, 74 %, 75 %, 76 %, 99 %, 100 % and for `C = 0` | new `tests/water.test.ts` (pure) |
| F2 | 75 % exactly classifies as `light`; 74.9 % as `severe` | same (`4·served` vs `3·C`) |
| F3 | Exact balance (`S = 0, P = C`) **admits** a colonist when housing exists | `tests/population.test.ts` (the existing water gate case is replaced) |
| F4 | Coverage `< 100 %` **suspends** admission; nobody dies from water | `tests/population.test.ts` |
| F5 | The served count shown equals the served count of the tick (one law) | `tests/cockpit-forecast.test.ts` pattern: assert `waterAdmissionGate(state).served` equals the stock delta of one `stepSimulation` |
| F6 | Pressure stays in `[0, 100]`, rises by the prescribed delta, falls only when covered | `tests/water.test.ts` |
| F7 | Save/load round-trips `waterPressure`; a v19 save loads with `0`; `101`, `-1`, `1.5` and `"x"` are rejected | `tests/persistence.test.ts` |
| F8 | Determinism: same seed + same command script ⇒ identical `waterPressure` at every tick | existing self-play line, `tests/selfplay.test.ts` |
| F9 | No alert when `served === population`; an alert when `served < population` | `tests/analysis.test.ts` |
| F10 | Stats panel shows coverage, pressure and state; the value comes from `waterState`, never recomputed in the panel | UI review + `tests/overlay.test.ts`/stats test |
| F11 | Food yields, costs, progression thresholds and food reserve unchanged | the full existing suite, unchanged assertions |
| F12 | `overlay.ts` water balance and `analysis.ts` water balance are one function | grep: one occurrence of the expression |

---

## G. Implementation plan (one chantier, five phases)

| Phase | Content | Validation (< 2 min each) |
|---|---|---|
| 1 | `src/domain/water/water.ts`: `waterCoverage`, `waterState`, `waterPressureDelta`, `updateWaterPressure` (pure, no call sites yet) + `tests/water.test.ts` (F1, F2, F6) | `node node_modules/vitest/vitest.mjs run tests/water.test.ts` |
| 2 | Tick wiring: measure `waterProduced`/`waterServed`, run the pressure phase; `population.ts` gate on served; `updatePopulation` signature | `tests/population.test.ts`, `tests/water.test.ts` |
| 3 | One law: `analysis.ts` alert + summaries read `waterCoverage`; `overlay.ts` duplicates removed; `plan` ceiling unchanged but sourced from the same module (F5, F9, F12) | `tests/analysis.test.ts tests/cockpit-forecast.test.ts tests/overlay.test.ts` |
| 4 | Persistence: `waterPressure` in state, `SAVE_VERSION 20`, `migrateV19ToV20`, validation (F7) | `tests/persistence.test.ts` |
| 5 | UI: stats panel rows (coverage %, pressure, state), alert copy for light/severe (F10); then the affected end-to-end pass | `pnpm typecheck && pnpm lint`, then the affected E2E specs once |

Each phase is committable on its own; no phase changes a yield, a cost, a food
rule or a progression threshold.

### Open decisions (not decided here)

- **D1 — the consequence of a shortage.** With mortality excluded and yields
  and costs frozen, the only mechanical consequence the locked decisions leave
  is the growth suspension. A real cost needs a lever outside this perimeter
  (e.g. a per-tick upkeep penalty, an admission-only effect, or letting
  pressure close the gate hysteretically). **Measured fact:** mothballing wells
  currently saves `1 money/tick` each and costs nothing at all (M4). Until D1
  is answered, the exploit survives this chantier.
- **D2 — light-deficit accumulation** (`+1` proposed).
- **D3 — recovery speed** (`−1` gives a 100-tick recovery from saturation).
- **D4 — hysteresis**: gate on coverage only (locked) or on pressure too.

---

## Files consulted

`src/domain/simulation/tick.ts` · `src/domain/simulation/state.ts` ·
`src/domain/simulation/commands.ts` · `src/domain/production/production.ts` ·
`src/domain/population/population.ts` · `src/domain/storage/storage.ts` ·
`src/domain/storage/spoilage.ts` · `src/domain/resource/resource.ts` (via
call sites) · `src/domain/environment/environment.ts` ·
`src/domain/jobs/jobs.ts` · `src/domain/economy/economy.ts` ·
`src/domain/building/building.ts` · `src/domain/building/placement.ts` ·
`src/domain/network/network.ts` · `src/content/buildings.ts` ·
`src/content/techs.ts` · `src/application/persistence/save.ts` ·
`src/application/queries/analysis.ts` · `src/application/queries/stats.ts` ·
`src/app/ui/statsPanel.ts` · `src/renderer/overlay.ts` ·
`tools/agent/play.ts` · `tools/agent/README.md` ·
`tests/population.test.ts` (index) · `tools/agent/scenarios/*.jsonl` (headers)

## Validations actually performed

| Validation | Result |
|---|---|
| Code inspection of the water cycle, gate, storage, persistence, queries | **PASS** (facts cited with file:line above) |
| Real-pipeline replay M1 (exact balance, growth frozen, no alert) | **PASS** — defect reproduced |
| Real-pipeline replay M2 (new well at exact balance yields nothing) | **PASS** |
| Real-pipeline replay M3 (shortage kills nobody over 400 ticks) | **PASS** |
| Real-pipeline replay M4 (mothballed well: money up, population unchanged) | **PASS** |
| Real-pipeline replay M5 (D2 opening sits exactly at balance) | **PASS** |
| Target model scenarios E.2–E.4 | **NOT RUN** — the model is not implemented; values are DERIVED |
| Unit tests / typecheck / lint | **NOT RUN** — no code was modified |
| End-to-end / GPU | **NOT APPLICABLE** — no behaviour changed |
| Save migration of `waterPressure` | **NOT RUN** — nothing written yet |

## H. Calibration and implementation (measured 2026-11-16)

The §D.2 law as written (float `k = 2`, proportional to `(0.75 − R)/0.75`) has
no usable resolution near the boundary. Measured on the tick's own integers:

| Shortage | served/need | ΔH per tick (k = 2) | Ticks to 100 |
|---|---:|---:|---:|
| boundary (severe) | 64/86 = 74,42 % | 0,0155 | **6 451** (53,8 min at 1×) |
| pop 22, 8 wells | 16/22 = 72,73 % | 0,0606 | 1 650 (13,8 min) |
| pop 22, 7 wells | 14/22 = 63,64 % | 0,3030 | 331 (2,8 min) |
| blackout | 0/86 | 2,0 | 50 (0,4 min) |

A 130× spread means the gauge is invisible exactly where it should warn the
player. Implemented instead (`src/domain/water/water.ts`): whole points,
`ΔH = max(1, round(4 · severity))`, severity `= (3·need − 4·served)/(3·need)`.
Measured on the cockpit: 60 % coverage (6/10) → **+1/tick**, 40 ticks → 40;
80 % (light) → **holds** at 41 for 20 ticks; back to 100 % → **−1/tick**,
41 → 22 in 20 ticks. Recovery from saturation = 100 ticks (50 s at 1×).

Also measured: `75,00 %` is unreachable unless `pop` is a multiple of 4
(`served` is an integer); for `pop = 86` the boundary sits between 64 (74,42 %,
severe) and 65 (75,58 %, light), and well output is even, so the real pair is
64 / 66 (76,74 %).

Implemented: `waterPressure ∈ [0,100]` integer in the state, saved
(`SAVE_VERSION 20`, `migrateV19ToV20` → 0), tick-updated from the tick's own
served/need, with §6 bands as alerts from `tension` (25) up and two stats rows
(coverage %, pressure). No yield, cost, food rule or progression threshold was
touched; pressure produces **no** effect of its own beyond the alerts and the
growth suspension that already existed — the demographic consequence at 100
stays undecided (D1).
