# NOVA — Development Workflow

## 1. Standard implementation cycle

```text
Product requirement
        ↓
Repository inspection
        ↓
Technical/design decision
        ↓
Smallest coherent vertical slice
        ↓
Implementation
        ↓
Unit/integration tests
        ↓
Browser/render validation
        ↓
Full relevant gates
        ↓
Diff review
        ↓
Commit
        ↓
Step report
```

## 2. Task specification

Each substantial step should define:

- objective;
- current state;
- requirements;
- non-goals;
- acceptance criteria;
- validation;
- expected files/systems only when known.

## 3. Vertical slices

Prefer slices that make the game more complete.

Example:

Bad sequence:

- build entire resource framework;
- build entire UI framework;
- build entire rendering framework;
- eventually connect them.

Better:

- one resource;
- one producer;
- one storage path;
- one consumer;
- visible analysis;
- test complete causal loop;
- expand.

## 4. Change discipline

Before implementation:

- inspect existing code;
- identify reusable components;
- identify invariants;
- identify affected tests.

After implementation:

- inspect diff;
- remove accidental changes;
- run validation;
- update durable documentation.

## 5. Commit discipline

A commit should represent one coherent engineering change.

Examples:

```text
feat(simulation): add aggregate food production
feat(logistics): distribute resources through storage network
feat(ui): add resource inspection drill-down
fix(population): prevent growth above housing capacity
```

## 6. Product decisions

If a new requirement changes a durable design rule, record an ADR rather than burying the decision in implementation.

## 7. Done means done

A task is not complete because the code compiles.

Completion requires:

- behavior implemented;
- relevant tests;
- validation;
- no accidental changes;
- documentation updated when necessary.
