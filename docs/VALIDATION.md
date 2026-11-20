# NOVA — Validation

## Principle

Validation is evidence, not intention.

Never report a check as passing unless it was actually executed.

---

## Validation Levels

### G0 — Repository Integrity

Check:
- branch;
- HEAD;
- working tree;
- unexpected changes.

### G1 — Type Safety

Run the project's TypeScript validation.

### G2 — Lint

Run the configured linter.

### G3 — Focused Tests

Run tests directly related to the change.

### G4 — Related Tests

Run the affected domain/module test suite.

### G5 — Build

Run the production build when relevant.

### G6 — E2E

Run browser tests when user-facing behavior changed.

### G7 — Visual

Perform browser/visual inspection when rendering or UI appearance changed.

### G8 — Performance

Measure when the change affects simulation, rendering, large data sets, or frame-time-sensitive code.

### G9 — Persistence

Validate save/load compatibility when persistence is affected.

### G10 — Final Diff

Review:
- changed files;
- accidental changes;
- debug artifacts;
- generated files;
- unrelated refactors.

---

## Escalation

Use the cheapest sufficient validation first:

    focused
      ↓
    related
      ↓
    full
      ↓
    E2E
      ↓
    performance

Do not repeatedly execute expensive checks while iterating on a low-level change.

---

## Failure Handling

When validation fails:

1. identify the first meaningful failure;
2. determine root cause;
3. fix it;
4. rerun the smallest relevant check;
5. escalate validation again.

Do not hide failures by weakening tests.

---

## Report

A validation report should contain:

| Check | Command | Result |
|---|---|---|
| Typecheck | actual command | PASS/FAIL |
| Lint | actual command | PASS/FAIL |
| Focused tests | actual command | PASS/FAIL |
| Full tests | actual command | PASS/FAIL |
| Build | actual command | PASS/FAIL |
| E2E | actual command | PASS/FAIL |
| Visual | actual method | PASS/FAIL |
| Performance | actual measurement | PASS/FAIL/N/A |
| Diff review | actual review | PASS/FAIL |

---

## Continuous integration

The same chain runs automatically on every push and pull request
(`.github/workflows/ci.yml`): install → typecheck → lint → **vacuity
audit** → unit → **core mutation probe** → build → E2E. Both instruments
of `TESTING.md` §4 (`pnpm test:audit`, `pnpm test:mutations:fast`) have
their own step because CI replays the chain one command at a time: a gate
added only to `pnpm check` would protect the workstation and the pre-push
hook while the pipeline that blocks a merge stayed blind to it. The probe
step runs the five mutations marked `fast` (~33 s); the full table is a
local measurement, and CI cannot afford it in the same run as the rest. A green local run is the same evidence a CI run produces —
`pnpm verify` replays the whole chain from an installed `node_modules`
(typecheck → lint → unit → build → E2E), and `pnpm check` plus
`pnpm test:e2e` do the same step by step.

CI is the shared floor, not a replacement for local validation: use the
cheapest sufficient check while iterating (see Escalation), and let CI
confirm the full chain before merging.

`githooks/pre-push` moves that floor in front of the push: opt into it
once per clone (`git config core.hooksPath githooks`, see
`DEVELOPMENT.md` §7) and a red `pnpm verify` stops the push instead of
being discovered by CI afterwards. It is a convenience, not an
additional gate level: the evidence is the same command output.
