# Agent play — headless cockpit

Lets an agent (or a human in a terminal) **play NOVA and judge its state**
without a browser, using the real command layer and the real tick pipeline.
Nothing is reimplemented here: mutations go through `applyCommand` /
`stepTicks`, and every reading is composed from the app's own queries
(`getColonyStats`, `getResourceSummaries`, `getAlerts`,
`getStaffingOverview`, `evaluateMilestones`) — so the verdict cannot drift
from what the UI shows.

```
./node_modules/.bin/vite-node does not exist: run.mjs loads play.ts
through Vite's SSR module loader, which is how the `@/` alias and the
TypeScript sources resolve without a build step or a new dependency.
```

## Run

```bash
# one JSON object per line on stdin
printf '%s\n' '{"cmd":"tick","n":200}' '{"cmd":"assess"}' \
  | node tools/agent/run.mjs

# or from a script file
node tools/agent/run.mjs --script play/session.jsonl

# machine-readable replies (one JSON per input line)
node tools/agent/run.mjs --json --quiet --script play/session.jsonl

# pnpm script (needs the libatomic workaround in the agent container)
pnpm play --script play/session.jsonl
```

Flags: `--json` (JSON replies), `--quiet` (report only on demand),
`--window N` (ticks without population change that count as stalled,
default 60).

Exit code is `1` if any command was rejected, so a script can gate on it.

## Protocol

| line | effect |
|---|---|
| `{"cmd":"init","seed":"agent-1","width":24,"height":24,"woodDeposits":[{"x":4,"y":4,"amount":60}],"stoneDeposits":[…]}` | new game (defaults mirror `DEFAULT_CONFIG` in `src/app/boot.ts`, so the default is the shipped game) |
| `{"cmd":"tick","n":200}` | advance the simulation, then print the report |
| `{"cmd":"build","type":"farm","x":3,"y":5,"road":true}` | place a road on a free orthogonal neighbour, then the building (what a player does); the road stays if the building is refused, and the reason is reported |
| `{"cmd":"plan","buildings":[{"type":"residence","x":10,"y":3}]}` | dry-run on a clone: places the plan through the real command layer, ticks it with the population pinned, and reports the cost, the food/water production and the resident capacity the plan sustains, with the binding constraint |
| `{"cmd":"do","command":{…}}` | raw `Command` (see `src/domain/simulation/commands.ts`): roads, removal, mothball, tech, advanceAge, events |
| `{"cmd":"report"}` | one-screen state summary |
| `{"cmd":"assess"}` | verdict + reasons + recent timeline |
| `{"cmd":"map"}` | ASCII grid (buildings, roads, deposits, terrain) |
| `{"cmd":"state"}` | full `GameState` JSON |
| `{"cmd":"save","path":"…"}` / `{"cmd":"load","path":"…"}` | real save format (`SAVE_VERSION`), validated on load |
| `{"cmd":"help"}` / `{"cmd":"quit"}` | — |

## Scenarios

| file | what it is |
|---|---|
| `tools/agent/scenarios/opening.jsonl` | the shipped opening, untouched: `critical` at t=120 and t=300 (pollution 100 closes admission, pop pinned at 10/10) |
| `tools/agent/scenarios/balanced.jsonl` | a winning age-1 line from the same opening: `HEALTHY` at t=540 and t=660 (pop 16/16, food 78 → 81 — a 5-tick reserve, water 25, pollution 0, net +3/tick, no alert). Re-anchored in **Step068**: the Step065 exact balance (5 farms = 16 food for 16 mouths) has no fixed point once conservation takes 3%/tick, so the line keeps 6 farms = 19 food and one park instead of two (one park already holds the air at net 0; the second was pure upkeep) |
| `tools/agent/scenarios/age2.jsonl` | the age-1 line continued to a **completed age 2**: `HEALTHY` at t=780 (age 2, pop 16/16, money 1152 net +5/tick, **6 farms = 19 food (5.1-tick reserve)** and 8 wells = 16 water, 16 workplaces for 16 workers, pollution 0, no milestone pending). Step068 restored this journey after Step067's conservation turned its exact balance into a permanent famine: the reserve farm costs 25 $ and 1/tick, so one park was dropped (its upkeep is what the age-2 treasury lacked) and the two age-2 techs are bought on either side of a `tick 60`, which keeps the t=780 anchor exactly where it was |

| `tools/agent/scenarios/age3.jsonl` | the age-2 line pushed to the **Age of Prosperity**: `HEALTHY` at t=1140 (pop 22/22, money 3295, net +7/tick, 47 buildings, **8 farms = 25 food (3.4-tick reserve)** and 11 wells = 15 water, 22 jobs for 22 colonists, pollution 0 at net −1, no alert, every age-2 milestone done) then `advanceAge` → `age3` at t=1141 (`HEALTHY`, milestones none). Step068 replaced the Step065 exact balance (7 farms = 11 wells = 22) with the reserve line; the push also builds a **park with the third workshop**, because three staffed workshops against one park close the admission gate (measured: quality 0, verdict CRITICAL). Teaches the endgame doctrine: an unstaffed workshop still earns (commerce is staffing-independent) and, since Step064, does not pollute either, and residences are upkeep-exempt |

`balanced.jsonl` carries the reasoning in its header: `cropRotation`
first (it breaks the age-1 infeasibility), parks before growth, water
before housing, and purchases spread so the tax of the first residents
finances the rest.

```bash
node tools/agent/run.mjs --script tools/agent/scenarios/balanced.jsonl
node tools/agent/evaluate.mjs --script tools/agent/scenarios/balanced.jsonl
```

## Planning a build (`plan`)

The first play test had to do one arithmetic step by hand over and over:
*how many residents does this economy actually feed?* `plan` answers it
before a single dollar is spent, without reimplementing a rule:

```bash
printf '%s\n' '{"cmd":"plan","buildings":[{"type":"residence","x":10,"y":3},{"type":"residence","x":10,"y":4}]}' \
  | node tools/agent/run.mjs
```

It clones the live state, places the planned buildings and their auto-roads
through `applyCommand` (cell, road and age rules are the game's), tops the
treasury up **on the clone only** because affordability is not the question,
and ticks the clone with the population pinned so admission cannot inflate
the answer. It then reads the clone with the same queries as the UI and
reports:

- `cost` and `affordable` against the real treasury;
- food and water per tick, jobs staffed, money net per tick;
- the **food reserve** (Step069): production, what the colonists eat, the
  conservation loss, the exact net change, the reserve the production settles
  at over the 5-tick target, and the status (`deficit`, `storage-limited`,
  `thin`, `building`, `funded`) with the production the target needs;
- **capacity** = the smallest of the food ceiling, water production and
  housing, the binding constraint, and the headroom over the current
  population. Water and housing are counts (one resident drinks 1 water per
  tick, housing holds one each) — food is NOT: since conservation takes
  3%/tick, `floor(food)` credits residents the loss will kill (measured:
  19 claimed, 16 funded). The food ceiling is therefore
  `foodSustainablePopulation(production, granary)`, the largest population
  whose steady stock — capped by the granary — still covers a 5-tick reserve.

It changes nothing in the live session: the plan is a question, not a command.

Capacity is a **resource ceiling**, not a verdict: production counts only
staffed producers, so a plan that adds jobs beyond the population reads low.
Storage IS modelled: when the granary cannot hold the reserve the plan says
`storage-limited`, and more food stops helping. Measured on the shipped
opening, four extra residences give `capacity 10 (binding: water)` — housing
stops being the limit before water does.

The air is reported **beside** the ceiling, never folded into it (Step069
follow-up). Pollution gates admission binary — quality below 25 freezes it
(without hurting anyone already there) — so it names no population and no
ceiling is lowered for it. `plan` reads the gate on the clone, i.e. after the
planned workshops and quarries have emitted into it, and prints
`· admission frozen (air quality 20 < 25)` or, while the air is still
breathable but closing, `· air closes admission in 12 ticks`;
`data.admission` carries `{ blocked, quality, threshold, ticksToClose }`. The
headroom keeps its numeric meaning, so a deficit is never softened into "no
headroom". Measured on a pop-5 colony (3 wells, 2 rotation farms):
`capacity 5 (binding: food) · headroom +0` — the economy is tuned so tightly
that the gate usually has no headroom to void; what it explains is a growth
that has *stalled* while food and housing look fine.

## Reading `assess`

- `verdict=healthy` — no warning alert, treasury net ≥ 0, no unconnected
  workplace, and population not stalled with housing headroom.
- `verdict=tight` — no alert, but a slow bleed or a fixable defect
  (negative net, workplaces without road access, growth stalled).
- `verdict=critical` — at least one warning alert (famine, water
  shortage, frozen treasury, storage waste, pollution gate), stocks under
  20 ticks, or an empty colony.

`reasons` lists the exact lines that produced the verdict; `timeline`
keeps the last samples so a run can be read backwards.

The admission gate is a verdict input in its own right (Step069 follow-up):
under dead air a full-housing colony used to read `HEALTHY` — every ceiling
looked satisfied because the air names none of them — and now the reading
carries `admission: { blocked, quality, threshold, ticksToClose }`, the
pollution line ends with `· admission frozen (air quality 20 < 25)` or
`· air closes admission in 12 ticks`, and `reasons` names the gate:
`growth frozen: air quality 20 < admission threshold 25`. Measured on this
build, quality below 25 already raises a `warning` alert, so a frozen colony
never actually *printed* healthy; the version of the truth that says "growth
has stopped" is what was missing, and the gate clause is the second line of
defence if that alert ever changes. The tests pin the invariant rather than
the branch: no frozen gate may read `healthy`, whichever warning fires.

The `food` block no longer reduces to a balance (Step069): it carries
`production`, `consumption`, `spoilage`, the exact `net` of the coming tick,
and a `reserve` object (`target`, `equilibrium`, `autonomyTicks`, `status`,
`capacityShort`). A colony can have a zero balance and still be in deficit —
that is what the 3% conservation does to the old exact-balance law.

`report` states the same split (`food 81/120 · prod 19 · eaten 16 · spoiled 3
· net +0/tick · reserve 5.1/5 ticks (funded)`), and the reserve sits in the
in-game stats panel as `reserve 5.1 / 5 ticks · funded` — one doctrine, one
place, three surfaces.

## Rendering axis (`observe` / `evaluate`)

The cockpit above is blind to presentation. Two more entry points close
that gap:

```bash
node tools/agent/observe.mjs --ticks 60     # probe only, prints PASS/FAIL
node tools/agent/evaluate.mjs --ticks 60    # both axes, writes a report
```

`observe.mjs` boots the real app with Playwright (127.0.0.1, port 5288 by
default), waits for `window.__nova`, captures at tick 0 and after N ticks
(at 8x), and reports canvas size, draw calls, geometry count, mean mesh
rebuild time, the **orbit camera** via `__nova.cameraView()`, console
errors and PNGs under `playtest/artifacts/agent/`. It fails on console
errors, a sizeless canvas, zero draw calls or a missing camera.

`evaluate.mjs` runs a JSONL scenario (`tools/agent/scenarios/opening.jsonl`
by default) and the probe, then prints and writes
`playtest/artifacts/agent/evaluate.md` with both axes and a single
`PASS`/`FAIL`. Exit code is 1 when either axis fails.

Chromium needs the cached libraries in this container:

```bash
export LD_LIBRARY_PATH="$(find ~/.cache/nova-e2e/root -name '*.so*' -printf '%h\n' | sort -u | tr '\n' ':'):$LD_LIBRARY_PATH"
```

## Notes

- Deterministic: same seed + same command sequence = same trajectory.
- The default world seeds are copies of `src/app/boot.ts`; a drift there
  means the agent is no longer playing the shipped opening (tests carry
  the same mirror and say so).
- The rendering axis reports **facts** (size, draw calls, camera, errors),
  never taste: whether the opening reads well still needs a human or a
  screenshot review. Screenshots are written for that review, not judged
  by the tool.
