# NOVA — Phase 0 verification and workforce decision sheet

Version : 1.0
Date : 18 novembre 2026
Build : `94cbff2` (`main`, clean tree)
Input : `docs/rebalance/v0.1/` (REBALANCE-ROADMAP §9 lists the five ambiguities answered here)
Status : measurement and framing only — **no simulation rule was modified**

Every figure below comes from one of two sources, marked in the tables:

- **measured** — a session run through `tools/agent/run.mjs` (real command layer,
  real tick pipeline), default config (`seed nova-default`, 24×24, wood
  (4,4)=60 + (18,6)=40, stone (7,18)=50), treasury 100 at t=0.
- **law** — the app's own function or catalog value, read in `src/` and quoted
  with its file.

Nothing here is taken from the earlier audit report. Where a number is derived
(arithmetic) rather than run, it is labelled so.

---

## 1. Verdict on the five ambiguities (ROADMAP §9)

| # | Question | Answer | Evidence | Status |
|---|---|---|---|---|
| 1 | Warehouse cost: which unit? | **25 money + 2 planks**, 2 construction ticks, `jobCapacity 0`, `plankCost 2` | `src/content/buildings.ts`; placement refused at t=0 with `insufficientPlanks` (measured) | Confirmed |
| 2 | Worker cost of each building | `jobCapacity 1` for **farm, well, workshop, lumberCamp, quarry**; `0` for residence, park, warehouse, colonyCenter. Staffing also requires **road adjacency** and `active` | `buildings.ts`, `isEligibleWorkplace` in `src/domain/jobs/jobs.ts` | Confirmed |
| 3 | Exact allocation rule | Eligibility (active + capacity>0 + road-adjacent) → order **farm (0), well (1), every other type (2)**, then canonical `y` asc, `x` asc, id → greedy 1 worker per workplace → **`assignJobs` is the LAST phase of the tick**. One exception: when the hydric gauge is at the grave band, `ceil(pop/2)` wells are staffed **first**, before the farms | `staffPriority`, `staffingOrder`, `assignJobs`, `waterWorkerReserve`, `updateWaterReserveLatch` in `jobs.ts` | Confirmed (dossier silent on the reserve) |
| 4 | Deposit coordinates / generation across seeds | Deposits are **explicit config, not seeded**: `woodDeposits`/`stoneDeposits` in the world config. Only the 6 % obstacle raster is seeded. Across **20 seeds**: centre at (23,23) 19×, (22,23) 1×; nearest deposit **20–21 tiles** away every time; obstacles 30–34 cells; **0 buildings** adjacent to any deposit | 20 sessions `init` + `state` (measured) | Confirmed — the distance is structural, not a property of the default seed |
| 5 | Exact list of "dead content" buildings | Split is needed: **unreachable/blocks by input** (quarry: 5 planks; warehouse: 2 planks — both refused at t=0), **unstaffable in a stable colony** (lumber camp at age 1 — §3 below), **output has no sink** (quarry: stone is produced and never spent anywhere in `src/`) | `buildings.ts`; `grep stone src` (no consumer); §3 | Corrected — see §2.3 |

Two rules the dossier does not mention and any workforce model must respect:

- **The hydric reserve already overrides the farm-first order.** When
  `waterPressure >= 75`, wells claim `ceil(pop/2)` workers before the farms
  (`waterReserveLatched`). This is part of the validated water-crisis law and is
  outside the rebalance perimeter (ROADMAP §5).
- **Food has a storage loss of 3 %/tick of `(stock + production)`**, with a
  carried fraction (`src/domain/storage/spoilage.ts`). The colony's stable stock
  is `foodEquilibriumStock(N, P) = (0.97·P − N) / 0.03`, so **a colony needs
  ~3.1 % more food than mouths just to hold its granary**. This is what makes
  "one farm more" so expensive, and the dossier's `farms(N) = ceil((N−1)/2)`
  formula ignores it.

---

## 2. What the dossier gets wrong

### 2.1 "Essential needs absorb exactly N posts, so no worker is ever free"

True **only before any farm-food technology**. The measurement:

| N | f=2 (no tech) | f=3 (`cropRotation`) | f=4 (`+ irrigation`) | f=5 (`+ winterWheat`) |
|---:|---|---|---|---|
| 10 | 5+5 = 10 → **0 free** | 4+5 = 9 → **1 free** | 3+5 = 8 → **2 free** | 2+5 = 7 → **3 free** |
| 15 | 8+8 = 16 → **−1** | 5+8 = 13 → **2 free** | 4+8 = 12 → **3 free** | 3+8 = 11 → **4 free** |
| 20 | 10+10 = 20 → **0 free** | 7+10 = 17 → **3 free** | 5+10 = 15 → **5 free** | 4+10 = 14 → **6 free** |
| 24 | 12+12 = 24 → **0 free** | 8+12 = 20 → **4 free** | 6+12 = 18 → **6 free** | 5+12 = 17 → **7 free** |

(derived from the laws: farms = smallest k with `(f·k + 1)·0.97 > N`, wells =
`ceil(N/2)`; `+1` is the Colony Center trickle. N=10/f=2 reproduces the measured
opening exactly: 5 farms, 0 free, stock settles at 22 — measured 47 falling at
−1/tick at t=5.)

And `cropRotation` is not optional: **age 1 requires 3 researched technologies**
(`src/content/progression.ts`), so every colony that advances has it. The
reference strategy therefore always has **1 free worker at N=10**, not zero.

**But one free worker is one short of the chain.** A stable age-1 colony at
N=10 (`cropRotation`, 4 farms at equilibrium 87, 5 wells) spends 9 posts and has
1 free: a lumber camp **or** a workshop can be staffed, never both — and the two
starting workshops take that worker before the camp (§2.2). The chain fits only
from **N=12** (4 farms + 6 wells = 10, 2 free; food equilibrium 20 at 13/tick —
law-derived, not yet played: see §6), which costs **2 residences and 1 well, 75
money** on a +1/tick opening. No new farm is needed: the shipped 5th farm is one
above the minimum (4), so parking it is lossless — measured at N=10 in Session C
(4 farms, net +0/tick, stock climbing to its 87 equilibrium). At N=12 the colony
would then run 4 farms + 6 wells + camp + **1** workshop = 12 posts for 12
colonists, the second starting workshop idle, and no slack at all (a drought
event halves every well).
That is the quantified version of the dossier's "industry is unreachable": not a
missing margin, a margin of exactly one worker.

### 2.2 "The chain wood → planks → stone → warehouse is not accessible"

It **is** accessible, and it was measured:

```
t=0..8   buy cropRotation (50), mothball building-14/15 (2 farms) and 21/22 (2 workshops)
t=8      build lumber camp at (5,4)                     → 25 $
t=10     reactivate building-21 (one workshop)
t=17     planks 5   (the quarry's exact cost)
t=25     planks 13  (1 plank/tick sustained), wood 2, deposits 72/100
```

What is inaccessible is doing it **without a food deficit**: that run ended at
food 22 and falling (−1/tick) with 3 farms. The reason is not a lack of capacity
— it is two rules stacked:

1. **3 %/tick conservation** (§1) makes 3 farms insufficient (10 food for 10
   mouths, plus ~1 lost = −1/tick); the stable age-1 line needs **4 farms**.
2. **Inside the "other" priority class the order is spatial (y, x, id).** The two
   starting workshops sit at y=1; a camp must sit at y≥2 because **row 0 is
   fully occupied** (measured: all 24 cells are buildings, roads or obstacles).
   So a freed worker always reaches the workshops **before** the camp.

Both were measured directly. With 4 farms (`cropRotation`, stable, +0/tick at
stock 56) exactly **1 worker** is free, and `workforce 10/12` shows the camp at
(5,4) still empty while both workshops are staffed — **wood 0, planks 0, no
alert, `assess` = HEALTHY**. The colony pays for a camp that never works, and the
workforce panel gives no cause beyond "no-road 0".

The order alone decides the cost: with 2 free workers (Session D, 3 farms),
**both** went to the two starting workshops and the camp stayed at 0 wood. So
under the current order the chain needs **free ≥ 3**; with extraction ranked
before transformation it needs **free ≥ 2**. That single comparison is the
argument for the order fix in §4.

### 2.3 "wood → planks → stone → warehouse"

It is not a chain. **Stone has no consumer anywhere in `src/`**; planks' only
sinks are the quarry (5) and the warehouse (2). The warehouse is fed by planks,
never by stone. So even a staffed quarry produces a number that nothing spends —
dead content independent of staffing.

Dead content, correctly split:

| Building | Blocked by | Status |
|---|---|---|
| Quarry | 5 planks, reachable only after §2.2's manoeuvre | Buildable but its **stone reaches nothing** |
| Warehouse | 2 planks (measured refusal) | Buildable, useful only once the granary is near cap |
| Lumber camp | A worker that never comes (spatial order) | **Inert at age 1**; works only if workshops are mothballed or `free ≥ 3` |
| Workshop (production) | Wood; the two starting shops eat the first freed workers | Production dead, **commerce alive** (staffing-independent by design) |

### 2.4 Minor

- `requiredAge` is wired in **five places** (placement validation, panel label,
  palette locked/unlocked lists, and a `boot.ts` comment claiming "palette
  unlocks follow building ages") and **set on 0 of the 9 catalog entries** → the
  palette is identical at every age. The dossier says "the UI and the validation
  seem to depend on it"; they do, and the catalog never feeds it.
- The rule of "commerce without staffing" is documented in `economy.ts` with the
  measurement that staffing-gated commerce takes the opening to **−2/tick**. The
  dossier's warning is correct and already recorded in code.

---

## 3. Measured sessions (default seed, real pipeline)

| Session | Actions | Result at the stated tick |
|---|---|---|
| A — opening, no action | — | t=0: pop 10/10, money 100 (+1/tick), **workforce 10/12**. t=5: food 47, prod 11, net −1/tick, reserve 2.2/5 "thin"; water 30, +0/tick |
| B — `cropRotation` only | research (50) at t=5 | t=8: prod 16, food 49→59, **net +3/tick**; workforce still 10/12 |
| C — 4 farms + camp | cropRotation, mothball 1 farm, camp (5,4) | t=18: workforce **10/12**, food 56, prod 13, net +0/tick, **wood 0, planks 0**, alerts none, `HEALTHY` → the 1 free worker went to a workshop |
| D — chain forced | cropRotation, mothball 2 farms + 2 workshops, camp, reactivate 1 workshop | t=25: **planks 13**, wood 2, deposits 72/100, workforce 10/10, food 22 at −1/tick |
| E — refusals | warehouse and quarry at t=0 | both `insufficientPlanks` (2 and 5) |
| F — 20 seeds | `init` + `state` ×20 | centre 20–21 tiles from the nearest deposit; 0 buildings adjacent; obstacles 30–34 |

**Cost of the shipped opening, measured**: adding a 4th workplace (the camp)
takes money from +1 to **+0/tick** (one more upkeep, no income), and the camp
produces nothing (Session C).

---

## 4. Decision sheet — workforce models

The question the roadmap leaves open is "which model frees labour". Each row is
scored against **the opening, N=10, `cropRotation` researched, 4 farms / 5 wells
(9 posts), 1 worker free** — the state Session C measured.

Two facts set the target. First, **the chain is 2 posts** (camp + workshop) on top
of survival, and the opening has **1 free worker at N=10**, 2 at N=12. Second,
**under the current order a free worker reaches an idle workshop before the
camp**, so the chain needs `free ≥ 3` today and `free ≥ 2` with extraction
ranked first.

| Model | Mechanism | Effect at N=10 | Effect at N=12 | Cost / risk | Verdict |
|---|---|---|---|---|---|
| **A — capacity > population** | work capacity = N + d, same eligibility set | d=1: 2 free → **both workshops, camp empty, 0 wood**. d=2: 3 free → camp + 1 shop → 1 plank/tick | d=1: 3 free → chain opens | Creates labour without mouths (dossier principle 5: no fictional workers); free labour grows linearly with N | **Not the primary fix.** Its effect is order-dependent and d=1 does nothing observable |
| **B — productivity of essentials** | already exists: `cropRotation` +1, `irrigation` +1, `winterWheat` +1 per farm | f=4 → 2 free → **both workshops, camp empty**; f=5 → 3 free → chain opens | f=4 → 3 free → chain opens with one spare | Moves the whole age-1 food balance (equilibrium 22 → 87 at 4 farms) | **The real long-run margin**, but cannot open N=10 alone before age 3 |
| **C — differentiated workforce** | population / active workers / capacity as distinct quantities | not measurable without implementation | — | Higher simulation + UI complexity; micro-management risk; addresses neither the order nor conservation | Deferred (as the dossier already says) |
| **D — rank the chain, name the cause (new)** | (i) inside class 2, **extraction before transformation** (camp before workshop, as farms are before wells); (ii) expose a verified `idle: no worker` state instead of "no-road" | 4 farms + 5 wells = 9, 1 free → **camp staffed, wood 2/tick** (planks still need the N=12 worker) | 2 free → **camp + 1 workshop → 1 plank/tick**, food equilibrium 20 | Must live in `staffingOrder` so the forecast cannot drift; no latch needed (the order is a pure function of state) | **Recommended P1 — see §8.2: only (ii) shipped.** (i) measured and rejected |

Why not (ii) as "park the surplus farm": measured, the 4th farm is **not**
surplus — it is exactly what pays the 3 %/tick conservation (3 farms = 10 food
for 10 mouths = −1/tick). Parking it would buy a few ticks at a full granary and
then drain the stock below N. A farm that could be parked would need production
above `N / 0.97` *with one farm fewer*, i.e. f ≥ 4 — which is model B, not a
staffing rule.

Recommended order: **D first** (cheap, and it is the difference between 3 free
workers and 2 for the same result), then **B or growth** to close the one-worker
gap at N=10 (N=12 costs 75 money; f=4 at age 1 would cost nothing but rebalances
food), and **A only if D + B still leave the chain unreachable** — with d ≥ 2,
never d = 1.

Open decisions that are the owner's, not the code's:

1. Should a colonist be able to work a camp while the colony runs a food
   deficit on purpose? (Today: yes, and it starves silently.)
2. Is stone meant to have a sink (construction cost, an age milestone, a
   warehouse tier), or should the quarry be removed from the catalog?
3. Does the game want a **hard** survival rule (exact coverage) or a **margin**
   (fixed free workers)? Model D keeps survival exactly as validated and only
   stops wasting labour.

---

## 5. Gates to measure once a model is implemented

Same protocol as ROADMAP §6; the numbers below are the ones that must move, and
the ones that must not.

Must move (measured today):

- **camp staffed** at N=10, 4 farms + 5 wells + 2 workshops + camp: today
  `10/12` with the camp empty; after the order fix the camp is one of the 10 and
  a workshop is the empty one (`10/12` again — the count does not move, the
  identity of the idle building does).
- first plank tick with no famine at N=12: **finite** (today: planks 13 only at
  N=10 with a −1/tick food deficit, Session D).
- the cause exposed for an empty workplace: it must be a verified state
  (workers / road / input), never "no-road" when the building has a road.

Must not move:

- opening budget **+1/tick** and the 0/tick wall of one extra farm (Session A);
- water crisis laws (`WATER_PRESSURE_GRAVE_THRESHOLD` 75, the reserve latch);
- the food equilibrium at 5 farms (≈22) — the opening's documented stock;
- determinism: same state + same commands → same staffing (`tests/` already pins
  the canonical order; a model that changes it owes a boundary test).

Report per phase, as AGENTS.md requires: unit duration, targeted E2E duration,
regression duration, build/typecheck/lint duration.

---

## 6. Residual Phase 0 work (not done here)

- **Several seeds beyond layout**: the world config is fixed, so seeds only move
  obstacles and the colony's raster placement. A run with 3 different deposit
  layouts (e.g. a deposit adjacent to the centre) is still needed to prove the
  chain does not depend on §2.2's manoeuvre.
- **A growth scenario** N=10 → 24 on the real pipeline, to replace the
  arithmetic table of §2.1 with measured staffing per population — in particular
  the N=12 line the recommendation depends on (4 farms + 6 wells + camp +
  workshop for 12 colonists).
- **Human play test**: no session here was played by a human; every policy was
  scripted and knew the rules.

---

## 7. Reproduce

```bash
# opening + one extra farm
printf '%s\n' '{"cmd":"tick","n":5}' '{"cmd":"report"}' | node tools/agent/run.mjs

# Session C — the free worker that never reaches the camp
printf '%s\n' \
 '{"cmd":"tick","n":8}' \
 '{"cmd":"do","command":{"kind":"researchTech","techId":"cropRotation"}}' \
 '{"cmd":"do","command":{"kind":"setBuildingActive","id":"building-15","active":false}}' \
 '{"cmd":"build","type":"lumberCamp","x":5,"y":4,"road":true}' \
 '{"cmd":"tick","n":10}' '{"cmd":"report"}' | node tools/agent/run.mjs

# Session F — 20 seeds (one spawn, 20 init+state pairs)
```

No file of `src/` was touched by this phase; `git status --porcelain` is empty
and `docs/` was git-ignored at the time (only `docs/STATE.md` was published);
**since 2026-11-20 the whole `docs/` tree is versioned**.

---

## 8. Follow-up — what model D actually became (measured 2026-11-18)

Phase 0 recommended two halves of D. Only one survived measurement.

### 8.1 D(ii) — one order, one assignment (shipped, `88900bc`)

`staffingOrder` is now exported and `staffingAssignment` is the single greedy
pass; `assignJobs` writes its result and `getStaffingOverview` reads it. Both
defects were real and are now pinned:

- the overview ranked workplaces by cell alone, so a well on a lower cell than a
  farm was ranked first and shown "staffed" while the phase staffed the farm
  (`tests/staffing.test.ts`, "ranks by priority class, not by cell");
- the overview ignored the hydric reserve, so during a water crisis it showed the
  farms staffed and the wells idle — the exact inverse of the phase
  ("mirrors the hydric reserve").

No balance moved: 190 unit tests, the vacuity audit (205 declarations, 0 finding)
and all 6 scenarios pass unchanged. The idle cause was already `no-workers`; what
was wrong was the rank and the staffed set it was attached to.

### 8.2 D(i) — extraction before transformation (measured, REJECTED)

Strictly ranked (camp/quarry before workshop), the governed line
(`playGame(-1, false, 240, 86)`, 1500 ticks):

| tick | planks, baseline | planks, extraction first | pop, baseline | pop, extraction first |
|---|---|---|---|---|
| 400 | 3 | **33** | 17 | 21 |
| 800 | 1 | 31 | 37 | 45 |
| 1200 | 1 | 29 | 61 | 59 |
| 1500 | 1 | 27 | **86** | **60** |

Age 3 readiness was NOT reached in either order by t=1500 (t=321 is Age 2, in
both: `ready@321`, `age2@321`, `pop12@328`; the baseline ends at 32 food against
the Age-3 gate of 75). The earlier "Age 3 at t=321" reading was the Age-2 mark.
Two conditional variants — "only while the shops cannot be fed" and "only while
the yard cannot fund a single batch" — land on the same 60.

Cause — CORRECTED by a per-tick trace on 2026-11-18 (the first write-up claimed
labour exhaustion; the trace says otherwise). At the plateau the run has **13 free
workers**, no active camp, no staffed workshop, 121 food and air quality 55, and
the population sits at its **housing capacity** (60/60). The treasury oscillates
between 35 and 59 — under the reference policy's build threshold — and every
crossing is spent on the options ranked ahead of the residence (farm reserve,
wells, warehouse, park), so the 61st residence is never funded. The 60 is a
funding path, not a labour law: measured on the same laws with the same policy,
the baseline funds housing up to the 86 cap while sitting on 74 idle wood and one
plank. See `v0.1/DIAGNOSIS-POPULATION-PLATEAU.md`.

Consequence: the tail class keeps its cell order, and `staffPriority`'s doc names
the measurement so the next audit does not re-propose it.

### 8.3 The growth line, measured on the real pipeline

Default opening (5 farms, 5 wells, 2 workshops, 10 residences, pop 10), a camp at
(5,4) next to the (4,4) deposit, three extra residences, one tick per sample:

| population | farm | well | camp | shop | planks/tick |
|---|---|---|---|---|---|
| 10 | 5/5 | 5/5 | **0/1** | **0/2** | 0 |
| 11 | 5/5 | 5/5 | **0/1** | 1/2 | 0 |
| 12 | 5/5 | 5/5 | **0/1** | 2/2 | 0 |
| 13 | 5/5 | 5/5 | **1/1** | 2/2 | **+1** |

At 13 colonists every eligible post (5+5+2+1) is staffed and the chain runs from
t=30: wood sits at 0 because one camp cannot feed two shops, and planks climb
1 → 4 over four ticks. This is the first plank tick with no famine measured in
this project — Phase 0 only reached planks 13 at N=10 with a −1/tick deficit.

Food at 13 colonies is −3/tick (15 produced, 13 eaten, 3 % of 15 spoiled), so the
line needs `cropRotation` before it can park at 13. The camp's late staffing is
not a defect of the order: 12 of the 13 posts are survival posts.

§5's gate "camp staffed at N=10" is void (8.2). The gate that replaces it — "the
surface names the cause the phase actually has" — is pinned by the two tests.

### 8.5 Where this was carried

- `../adr/ADR-016-staffing-priority-order.md` — the decision to keep the order,
  with both claims above withdrawn.
- `v0.1/GAME-DESIGN-WORKFORCE.md` §10 — the order as applied, and the one-worker
  industrial margin.
- `v0.1/GAME-DESIGN-ECONOMY-RESOURCES.md` §9 — what the chain produces, the 2-vs-4
  wood ratio, and stone's absent consumer.
- `v0.1/GAME-DESIGN-INDUSTRY-BEFORE-13.md` — the five-option comparison (no
  coefficient fixed, no option implemented).
- `v0.1/DIAGNOSIS-POPULATION-PLATEAU.md` — the 60-plateau trace and its causal
  order.
- `v0.1/BALANCE-BASELINE.md` §8 — the measurements, restated for the dossier.

### 8.4 Browser check

The full E2E suite is a milestone gate and was not run. The one journey that
reads the staffing line was, with the library path STATE.md documents:

```bash
LD_LIBRARY_PATH=~/.local/pwlibs/usr/lib/x86_64-linux-gnu:~/.local/lib \
  node node_modules/@playwright/test/cli.js test e2e/interaction.spec.ts \
  --grep "staffing|inspect"
```

1 passed, 28.8 s (the inspection asserts `staffing · <rank>/<total> · staffed`).
