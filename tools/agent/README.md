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
| `tools/agent/scenarios/balanced.jsonl` | a winning age-1 line from the same opening: `HEALTHY` at t=540 and t=660 (pop 16/16, food 16 = 16, water 16 = 16, pollution 0, net +3/tick, no alert) |
| `tools/agent/scenarios/age2.jsonl` | the age-1 line continued to a **completed age 2**: `HEALTHY` at t=780 (age 2, pop 16/16, money 787 net +5/tick, 5 farms = 16 food and 8 wells = 16 water both +0/tick, 15 workplaces for 15 workers, pollution 0, no milestone pending). Re-anchored in Step065 when the market was removed: with no sink for a food surplus the line aims at an EXACT balance instead of `mouths + 2` sold, so a colony that reaches 120/120 and reads `critical` on the storage warning alone is the thing to avoid |

| `tools/agent/scenarios/age3.jsonl` | the age-2 line pushed to the **Age of Prosperity**: `HEALTHY` at t=1140 (pop 22/22, money 3319, net +8/tick, 46 buildings, food and water at +0/tick, 21 jobs for 22 colonists, no alert, every age-2 milestone done) then `advanceAge` → `age3` at t=1141. Re-anchored in Step065 to the next exact balance (7 farms = 11 wells = 22) because the market no longer sells the surplus. Teaches the endgame doctrine: an unstaffed workshop still earns (commerce is staffing-independent) and, since Step064, does not pollute either, and residences are upkeep-exempt |

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
- **capacity** = the smallest of food production, water production and
  housing (one resident eats 1 food and drinks 1 water per tick, so a rate
  *is* a population count), the binding constraint, and the headroom over
  the current population.

It changes nothing in the live session: the plan is a question, not a command.

Capacity is a **resource ceiling**, not a verdict: pollution (the admission
gate) and storage caps are not modelled by it, and production counts only
staffed producers, so a plan that adds jobs beyond the population reads low.
Measured on the shipped opening, four extra residences give `capacity 10
(binding: water)` — housing stops being the limit before water does.

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
