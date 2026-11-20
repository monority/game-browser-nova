# NOVA — Testing Strategy

What to cover. Not how to run it, and not how to decide it is enough:
those two rules already have homes, and this file only points at them.

- **Which command, which level, how far to escalate** — `VALIDATION.md`
  (§Validation Levels, §Escalation). One ladder, one owner.
- **How to execute while iterating** (time budgets, server reuse, no
  blind repetition) — `AGENTS.md` §E2E Execution Discipline.
- **Current counts, durations and the state of each gate** —
  `STATE.md`. Volatile numbers are not copied here: a figure in two
  documents is a figure that will eventually disagree with itself.

---

## 1. What the suite is for

Tests protect gameplay rules and player-visible behaviour, not
implementation trivia. A test that would still pass if the rule it names
were deleted is not protecting anything — that is the failure mode the
mutation probe exists to catch (§4).

## 2. Where the tests live

```text
tests/            unit + integration over the real domain seams (vitest)
e2e/              browser journeys a headless test cannot observe
tools/testing/    instruments that measure the suite itself
```

The split between `tests/` and `e2e/` is a rule, not a preference: a
spec exists only for what a headless unit test cannot observe — DOM
wiring, panel text, persistence across a reload, renderer lifecycle.

## 3. Coverage catalogue

Domain behaviour belongs in `tests/`, at the seam that owns the rule:

- production, consumption, storage, spoilage, reserve doctrine;
- logistics and workforce allocation;
- needs satisfaction, population growth, housing;
- pollution and environment quality;
- economy, treasury, commerce, events;
- milestones, technology, age transitions;
- deterministic world generation and seeded events.

Integration tests pin the crossings, where a unit test alone would let a
regression slip between owners:

- production → storage → consumption → spoilage;
- logistics → needs → workforce → production;
- pollution → environment → quality of life → admission;
- milestone → age transition → new content set.

## 4. Instruments that measure the suite itself

A green suite is evidence only if the assertions can fail. The probe
injects one deliberate regression at a time into `src/`, runs the file
that should catch it, and restores the file (hash-checked):

```bash
pnpm test:mutations              # whole table (68 mutations, ~440 s)
pnpm test:mutations --batch 2    # one batch, inside the 2-minute rule
pnpm test:mutations --fast       # the CI subset: 5 core laws, ~33 s
pnpm test:mutations --list       # the mutation ids
```

Verdicts: `caught`, `SURVIVED` (a real hole), `STALE` (the target text
moved), `PINNED` (declared equivalent) and `BROKE` (the tree was not
restored — exit code `2`).

The `--fast` subset exists so the probe has a trigger at all: CI runs the
five mutations marked `fast` (staffing access, negative treasury,
starvation rate, two buildings per cell, future save version — one per
core law, measured 32.8 s for all five) after the unit tests. A subset is
a compromise, not a gate: it cannot report what it does not probe, so the
full table stays the measurement before a milestone, and the subset's job
is to notice a suite that stopped being able to fail, not to certify it. Add a row to `MUTATIONS` when a rule is new
enough to be worth protecting, and run the batch before trimming tests.

Batch 7 probes the probe: it mutates the laws behind assertions added on
the same day, and each mutation was run twice - with the new assertion
and without it. Measured 2026-11-14: three of the four were `caught`
either way, because a neighbour assertion already saw the break; the
fourth was the single guard behind its claim (`SURVIVED` without it).
Batch 8 pointed the table at the two largest modules it had never
touched — `application/queries/analysis.ts` and
`domain/simulation/commands.ts`. Both mutations aimed at the command seam
died. Both aimed at the verdict engine survived: environment severity
bands and the full-granary alert had no observer, so the row named as
locking them (`tests/storage.test.ts`, `reports pinned stock … as
information`) had not existed since the test cut, and nothing noticed. Two
assertions were written against the reading, and the mutations die now.
The lesson is about coverage, not about `analysis.ts`: 19 of the 30
`domain/`+`application/` modules carry a mutation, and the biggest one did
not — a gap no green suite can report.

Batch 9 (4 mutations) applied the same test to `domain/logistics/logistics.ts`
and found the pattern again, one step further from the data: three of the four
laws had no observer. A mothballed warehouse still extended the road network; a
fractional logistics share rounded up instead of down; the wheelbarrow tech was
sold and did nothing. All three now have assertions. The fourth mutant moves the
free-radius comparator (`<=` → `<`) and cannot change behaviour, since at
`d == radius` the decay term is zero — it is tagged `equivalent: true`, so a red
run there would mean a test pins the comparator rather than the curve.

The common thread across batches 8 and 9 is not `analysis.ts` or `logistics.ts`:
it is that a law with no assertion is invisible to a green suite, and the two
largest unprobed modules each held several. The remaining unmutated modules
(`preferences.ts`, `stats.ts`, `world.ts`, `building.ts`, `rng.ts`) are the queue —
batch 10 took the first two: one bad preference field resetting the other, an
unvalidated speed id, water waste reported as food waste and an `Infinity`
reserve where the cockpit expects `null` were all unobserved. The pattern holds
four batches running, so treat "module without a mutation" as "law without an
assertion" until a batch says otherwise.

Batch 11 (2026-11-14) closed the queue and contradicted the pattern: the three
modules with no test file of their own (`world.ts`, `building.ts`, `rng.ts`) had
four of their five laws watched from a distance — terrain density shows up in
eleven suites because every fixture is seeded — and the one nothing saw was the
seeded sequence itself. That is the worst place to be blind: a save stores a
seed, `save.ts` regenerates the world from it, and every determinism test still
passes against a changed mulberry32 because each run agrees with itself. The
rule it leaves behind: a determinism test proves a run agrees with itself, not
that it agrees with the saves already written.

Batch 12 (2026-11-14) changes the unit of work: instead of taking a module, it
takes the absolutes written in module headers ("never more than the stock",
"never one that overflows the granary", "value-preserving defaults only") and
asks the probe whether each is a law or a comment. That is the cheapest batch
written so far and it found the kind of hole no module scan finds: `capacity - 1`
was documented, deliberate and unobserved, and the one farm count it excludes
lands at 119.67 on a 120-unit granary — under the cap by a third of a unit, so
the plan would have promised a reserve the next tick destroys. Prefer this shape
when the queue of untouched modules is empty.

A SURVIVED verdict is the probe's only claim about the suite, so it must prove
the suite ran. Batch 12's first pass returned five survivors in 2.2 s because
the sandbox had 20 PIDs left: Vitest children died with `spawn EAGAIN`, the
parent exited 1 with no summary, and "exit 1, nothing red" read as "nothing
noticed". Two gates now stand in the way — a preflight that refuses to start
when the host cannot spawn a child or sits above 90 % of its PID budget, and a
per-run requirement for the summary Vitest prints only after judging. To see
the second one work without starving the machine:
`NOVA_PROBE_VITEST=/nonexistent node tools/testing/probe-mutations.mjs --only E1`
must print `BROKE` in 0.0 s.

So a pin buys little detection. What it buys is that the claim is true
when the list is empty: the `.every` it replaced caught the same leak
just as well, but asserted nothing at all in the state the test actually
runs in.

A survivor is only acceptable when it is *equivalent* — the mutation
cannot change observable behaviour (an integer count under a floor and a
ceil, for example). Declaring one is a claim to state in the table, not
a way to silence the probe.

### The vacuity audit

The probe answers "would this test fail if the law broke?". It cannot
answer "does this test assert anything at all?" — a test that asserts
nothing still counts as passing, so it would be reported as caught.
That is what `pnpm test:audit`
(`tools/testing/audit-vacuity.mjs`) covers, and it runs inside
`pnpm check`, so a new instance fails the chain instead of being found
by hand later. It reads **both** suites — `tests/` and `e2e/`, 35 files
and 123 declarations — because nothing about vacuity is specific to a
runner, and the browser specs are exactly where an assertion behind a
locator condition is the natural shape. `test.describe(...)` is treated
as the group it is, not as a test.

| Rule | What it refuses |
|---|---|
| R1 | a `describe` with no test in it |
| R2 | a test whose body never asserts |
| R3 | `skip` / `todo` / `only` |
| R4 | an assertion behind an `if` whose other branch asserts nothing |
| R5 | a loop that asserts over a computed collection with no length pin |
| R6 | `every()` inside an assertion past an unpinned collection |

The tool carries a `--selftest` (10 fixtures: one per rule, a
browser-shaped `if`, a Playwright group, an `if/else` and a pinned loop
that must stay silent) because a detector that stops detecting looks
exactly like a clean suite — its first run reported 87 findings, all
false, and its first version was blind to every condition containing a
call. Run it after touching the parser, not after every change.

R4 and R5 are the two shapes that were found by hand before the script
existed: a road rejection behind `if (blocked)` (a seed without blocked
terrain would have checked no rule) and an event test that dispatched on
the kind the seed drew, asserting neither effect when it drew a third.
Both were green for as long as nobody read them.

## 5. Determinism

Given the same seed, configuration, initial state and command sequence,
the simulation must produce the same output. The claim is pinned once at
the `stepSimulation` seam; a second test repeating it is a duplicate,
not extra safety. If determinism intentionally changes, the save/version
contract (`SAVE-FORMAT.md`) moves with it.

## 6. Save / load

Every persistence change keeps: save current state, load it, compare
canonical state, continue the simulation, verify the continuation is
deterministic. Rejection paths are table rows — a save naming the same
technology twice, an unknown shape, a future `formatVersion` — because
that is how an old build corrupts a newer save.

## 7. Regression policy

A fixed gameplay bug gets a regression test when practical — one
assertion in the test that already owns the rule, not a new file. If the
bug was invisible to the mutation probe, add the mutation row so the
next trim cannot silently remove the assertion.

## 8. Assertions must be able to fail

Not restated here because `VALIDATION.md` §Failure Handling owns it
("do not hide failures by weakening tests"). Three additions specific to
this suite:

- no conditional assertion left unguarded — pin the length or the
  membership before iterating, or `.every()` / `.some()` over an empty
  collection passes by construction;
- no sleep-based synchronisation where a deterministic readback exists;
- never mock the system under test: the seam under test runs for real,
  only the layer above it is faked.
