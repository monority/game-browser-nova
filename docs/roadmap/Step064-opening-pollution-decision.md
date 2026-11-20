# Step064 — The opening poisons itself: measured decision brief

**Status:** IMPLEMENTED (option B chosen by the owner 2026-11-12). One follow-up decision is open (§5).

**Date:** 2026-11-12.

**Context.** Step059/061 measured, through the headless cockpit, that the shipped
opening ends in `critical` (pollution 100, quality 0, pop pinned). Step062/063
fixed the two economy defects that were found in the same pass. This step
records what the pollution reading actually costs the player, so the owner can
decide whether the opening composition changes.

## What was measured

Cockpit only (`node tools/agent/run.mjs`), default seed and the shipped D2
opening (10 pop, 10 residences, 5 farms, 5 wells, 2 workshops, 12 workplaces /
10 staffed), no player action:

| tick | pollution | quality | population |
|---|---|---|---|
| 0 | 0 | 100 | 10/10 |
| 37 | 74 | 26 | 10/10 |
| **38** | **76** | **24** | 10/10 — below `MIN_QUALITY_FOR_ADMISSION` (25) |
| 39 | 78 | 22 | 10/10 |
| 60 | 100 | 0 | 10/10 |
| 300 | 100 | 0 | 10/10 (Step059 reading, unchanged) |

Net flow `+2/tick` = 2 workshops × `POLLUTION_PER_WORKSHOP_PER_TICK` (1), no
absorber. Admission closes at **t=38**, i.e. 38 ticks after the start.

**The gate is invisible at first.** The opening is exactly full (10/10 housing),
so no admission can happen anyway: the player discovers the closed gate only
after buying the first residence, and then reads `Environment: quality 0` in the
alerts, with the Step056 admission-block countdown in the stats panel.

## The remedy is one purchase

One `park` absorbs `ABSORPTION_PER_PARK_PER_TICK` = 2, exactly the opening's
emissions, and costs 25 money, 0 planks, 0 water, 0 jobs:

```
init → build park 4,2 → tick 60 → tick 120 → tick 180
t=60   pollution 2  (q98) · money 131 · alerts none
t=120  pollution 2  (q98) · money 191 · only "Food storage full"
t=300  pollution 2  (q98) · money 371 · stable
```

(The 2 is the pollution accumulated during the park's 2 construction ticks; it
never grows again.) So the opening is not an economic wall: it is a **knowledge
trap** — 25 $ and no labour make the whole age-1 tier pollution-neutral, and the
player who does not know that loses the air gate permanently.

## The air is not even the first gate

Same opening, one residence + one well + one farm bought at t=0 (75 money):

```
t=20  pop 11/11 · pollution 40  (q60) · water 12/80   · alerts none
t=40  pop 11/11 · pollution 80  (q20) · water 0/80    · Water 10/11 served
t=60  pop 11/11 · pollution 100 (q0)  · water 0/80    · Water 10/11 served
```

Growth stops after **one** colonist, on water, before air matters: the opening's
`f5 r10 w5` is exactly balanced at pop 10, so any growth needs a well, a farm and
a residence together. Pollution is the *third* constraint behind food and water,
and the last one the player learns about.

## Options (one requires the owner's decision)

- **A — ship one park in the opening.** D2 becomes `f5 p1 r10 w5 s2`
  (100 − 25 = 75 opening money). The trap disappears at t=0; pollution becomes
  an age-2 problem, where industry actually appears. Cost: the player never sees
  the mechanic in age 1 unless they overbuild workshops (each workshop above the
  park's 2 absorption re-opens the countdown, which Step056 already surfaces).
- **B — workshops and quarries emit only while staffed.** Makes emission
  consistent with output (a mothballed workshop currently keeps polluting) and
  turns the opening into a staffing puzzle. Cost: an unstaffed workshop keeps
  earning commerce, so emission-free idling industry becomes the best age-1
  play — measured risk of a degenerate line, not verified yet.
- **C — no change.** Pollution stays a knowledge trap that 25 $ removes; the
  Step056 countdown and per-building pollution line already make it legible.
  Cost: the shipped opening still measures `critical` at t=120 and t=300, which
  is what `scenarios/opening.jsonl` pins.

**Recommendation was A**, cheapest by every measure (one unstaffed 25 $ building
cancels both opening workshops, no rule changes, no balance retuning).

## 4. Decision: B, implemented

The owner chose **B** (an emitter pollutes only while staffed). It reaches A's
result on the opening without touching the Step021 composition, and it makes the
rule coherent with production (no work, no exhaust).

Implementation:

- `pollutionContributionForBuilding` (`src/domain/environment/environment.ts`) is
the single gate: inactive → 0, emitter and unstaffed → 0, park → −2 (parks have
no job capacity, so they absorb regardless). `pollutionFlows`, the stats, the
Step056 countdown and the inspection line all read it.
- `updateEnvironment` moved BEFORE `assignJobs` (`src/domain/simulation/tick.ts`),
so emission uses the staffing set that produced the tick's output. Consequence:
a workplace emits one tick later than before, in the same tick as its output.
- Inspection states `pollution · none (unstaffed)` (`src/app/input.ts`).

Measured after the change:

| scenario | result |
|---|---|
| shipped opening, untouched | pollution **0 (q100)** through t=100 (was 100/q0) — its 2 workshops are among the 3 idling workplaces |
| balanced / age2 / age3 scenarios | `HEALTHY`, money unchanged (587 / 891 / 2448) |
| 4th workshop on the age-3 line | now idles (workforce 24/25): **+2/tick, pollution 0** (it used to starve the colony) |

Validation: `tsc --noEmit` clean, `eslint .` clean, `vitest run` 349/349,
`playwright test` 36/36. `e2e/simulation.spec.ts`'s environment spec had to be
rewritten: its fixed cells were already occupied, so it had been reading the
shipped colony's idling workshops as its emitter. Disabling the gate fails 2
unit tests (mutation check run).

## 5. Open follow-up: idling industry is free revenue

Because emission now needs staffing while commerce stays staffing-independent
(Step012), an unstaffed workshop is money with no environmental cost.
Measured on the opening: 3 extra workshops (75 $) → **net +5/tick, pollution 0
through t=90** (money 452). The same line under the old rule held the same money
(+5/tick) but pollution 100 by t=90 (control run with the gate disabled), so
Step064 removed the only price of that strategy: the park no longer prices
industry, and `parks before growth` loses its counterweight.

Three candidates, none implemented (each rewrites a decided rule):

1. workshop commerce requires staffing (Step012 change);
2. an unstaffed emitter keeps a base emission (partial revert of Step064);
3. workshop upkeep 3 at tradeRoutes 3, so an idle workshop nets 0.

The age lines that exist are unaffected (all three still `HEALTHY` with their
documented money), so this is a balance question, not a regression.

## Validation of this step

Documentation only. The numbers above are cockpit output, reproducible with:

```bash
printf '%s\n' '{"cmd":"init"}' '{"cmd":"tick","n":37}' '{"cmd":"tick","n":1}' \
  | node tools/agent/run.mjs
printf '%s\n' '{"cmd":"init"}' '{"cmd":"build","type":"park","x":4,"y":2}' \
  '{"cmd":"tick","n":60}' '{"cmd":"tick","n":60}' | node tools/agent/run.mjs
```

No source file, test or scenario was modified.
