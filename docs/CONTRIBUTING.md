# NOVA — Contributing

## Before Coding

Read:
1. `AGENTS.md`
2. `docs/ENGINEERING-INDEX.md`
3. `docs/STATE.md`
4. only the documents relevant to the task.

Inspect actual repository state.

---

## Scope

Every change should have:
- one objective;
- explicit non-goals;
- measurable acceptance criteria.

Do not mix unrelated cleanup or refactoring into a feature.

---

## Code

Prefer:
- strict TypeScript;
- explicit types;
- cohesive modules;
- pure domain logic;
- deterministic behavior;
- derived state;
- explicit actions;
- meaningful components;
- composition.

Avoid:
- God objects;
- hidden global mutable state;
- circular dependencies;
- UI-driven domain logic;
- renderer-driven simulation;
- speculative abstractions.

---

## Components

Extract meaningful reusable components.

Do not create artificial wrapper components solely to satisfy a component-count rule.

A component should have a clear responsibility or useful boundary.

---

## Dependencies

Do not add a package when the repository or platform already provides a sufficient solution.

Every new dependency must have a concrete reason.

---

## Tests

Add regression coverage for important behavior.

Prefer behavior tests over implementation-detail tests.

---

## Validation

Run the smallest sufficient validation first.

Escalate based on risk.

See `docs/VALIDATION.md`.

---

## Git

- Preserve user changes.
- Keep commits focused.
- Do not rewrite history casually.
- Do not push `main` without authorization.
- Never use destructive cleanup commands without explicit approval.

---

## Review Checklist

Before finishing:
- [ ] scope is respected
- [ ] architecture remains coherent
- [ ] components are meaningful
- [ ] tests exist where needed
- [ ] validation passed
- [ ] no debug artifacts remain
- [ ] no unrelated changes exist
- [ ] final diff reviewed
- [ ] documentation/state updated if necessary
