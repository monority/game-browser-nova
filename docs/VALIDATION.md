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
