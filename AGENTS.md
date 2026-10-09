# AGENTS.md — NOVA

## 1. Mission

NOVA is a 3D stylized city-builder / civilization-builder.

Optimize for:
1. Correctness
2. Product coherence
3. Simplicity
4. Maintainability
5. Testability
6. Performance
7. Developer experience
8. Token efficiency

Do not optimize for code volume, abstraction count, or file count.

Build the smallest correct system that proves the intended behavior.

---

## 2. Source of Truth

Before changing code, read only the documentation necessary for the task.

Start with:
1. `AGENTS.md`
2. `docs/ENGINEERING-INDEX.md`
3. `docs/STATE.md`
4. `docs/01-PRODUCT-VISION.md`
5. `docs/02-MVP.md`
6. `docs/03-DESIGN-RULES.md`
7. `docs/04-ARCHITECTURE.md`
8. the relevant domain document
9. relevant ADRs

Do not blindly read every Markdown file.

`STATE.md` describes actual repository state.
Product and architecture documents describe intended behavior.

Never invent repository state.

If documentation and implementation disagree:
1. inspect the implementation;
2. identify the contradiction;
3. determine the authoritative rule;
4. do not silently redefine the product.

If the conflict cannot be resolved from existing documentation, stop and report it.

---

## 3. Component-First Rule

Everything that can reasonably be a component becomes a component.

This applies to:
- UI;
- game entities;
- world elements;
- buildings;
- panels;
- inspectors;
- overlays;
- controls;
- reusable rendering objects;
- simulation modules where a component boundary is meaningful.

Create a component when it:
- can appear more than once;
- has a clear responsibility;
- has meaningful inputs;
- owns distinct visual or domain behavior;
- improves testing or readability;
- is likely to evolve independently.

Prefer composition over duplication.

Do not componentize blindly. A tiny local implementation with no independent responsibility does not need a component.

The goal is meaningful composability, not component count.

---

## 4. Domain / UI / Rendering Separation

Preferred dependency direction:

    Domain / Simulation
            ↓
       Application
        ↙       ↘
      UI       Rendering

Domain code must not depend on React, Three.js, DOM, or browser APIs.

React must not contain core simulation rules.

Three.js must not contain simulation rules.

Rendering represents state; it does not create game state.

---

## 5. Architecture

Prefer:
- TypeScript strict;
- pure domain functions where practical;
- explicit state transitions;
- deterministic simulation;
- fixed simulation ticks;
- rendering independent from simulation;
- aggregate simulation for MVP.

Avoid premature:
- ECS;
- Web Workers;
- WASM;
- event buses;
- dependency-injection frameworks;
- speculative caching;
- complex state-management frameworks.

Complexity must earn its place through a demonstrated requirement.

---

## 6. Never Invent

Before modifying anything:
- inspect the actual file;
- inspect imports and references;
- inspect related tests;
- inspect relevant configuration;
- inspect current behavior.

Never assume that a file, system, dependency, test, or feature exists.

Use repository evidence.

---

## 7. Token-Efficient Context

Treat context as a finite engineering resource.

Before reading a file, ask:
1. Is it directly relevant?
2. Can a search result answer the question?
3. Can a smaller section answer it?
4. Has this information already been established?

Prefer:

    search → inspect small region → act

over:

    read entire repository → reason → act

Do not read files speculatively.

Do not reopen files already understood unless their state changed.

Do not repeat commands whose result is already known.

When enough evidence exists to make a safe decision, stop investigating.

Never explore for the sake of exploration.

Avoid reading:
- `node_modules`;
- generated output;
- caches;
- minified assets;
- binaries;
- unrelated documentation;
- large lockfiles unless needed.

---

## 8. Big Vertical Slices

Prefer complete vertical slices over many tiny tasks.

A good implementation step crosses the necessary layers:

    domain
      ↓
    application
      ↓
    UI / rendering
      ↓
    tests
      ↓
    validation

Do not stop after creating types, interfaces, or abstractions.

The result of a major step should be observable and testable.

---

## 9. Execution Method

### PLAN
Determine:
- objective;
- affected systems;
- minimal files likely involved;
- non-goals;
- acceptance criteria;
- validation commands.

Do not produce a long plan.

### EXECUTE
Implement the smallest complete vertical slice.

Reuse existing patterns.

### VERIFY
Run targeted validation first.
Expand validation only when justified by the change.

### REVIEW
Inspect the final diff once.

### REPORT
Report:
- what changed;
- why;
- tests;
- validation;
- remaining issues.

---

## 10. Fast Feedback First

Use the cheapest validation that can falsify the current change.

Preferred escalation:

    targeted test
      ↓
    related tests
      ↓
    full suite
      ↓
    E2E / browser
      ↓
    performance validation

Do not repeatedly run expensive E2E or full-suite validation while iterating on a pure local function.

Do not rerun unchanged validation.

---

## 11. Command Efficiency

Prefer commands that answer one precise question.

Good:
- `git status --short --branch`
- `git log -1 --oneline`
- `rg "SymbolName" src/`
- `rg "TODO|FIXME|console\.log" src/`
- focused test commands
- targeted typecheck/build commands

Avoid:
- `find .`
- `tree -a`
- `cat .`
- `grep -R .`
- `git log --all -p`
- full repository dumps

Never dump `node_modules`, build output, caches, or generated files into context.

---

## 12. Testing

Tests verify behavior, not implementation trivia.

Prioritize:
- domain invariants;
- deterministic simulation;
- resource accounting;
- production;
- consumption;
- logistics;
- population;
- needs;
- progression;
- persistence;
- important user flows.

For UI test important rendering and interaction behavior.

For rendering, browser validation matters when visual behavior is part of the requirement.

Never weaken a test merely to make the suite green.

---

## 13. Simulation

The simulation must remain:
- deterministic;
- testable;
- independent of rendering;
- independent of React;
- explicit about state transitions.

Use fixed simulation ticks.

Rendering runs independently.

Randomness must be seeded and explicit.

Do not simulate individual citizens or deliveries in MVP unless explicitly required.

Prefer aggregate models.

---

## 14. State Management

Prefer:

    canonical state
        ↓
    derived values
        ↓
    presentation

Avoid duplicated state.

Do not store a value merely because it can be derived.

Do not introduce a global store automatically.

Use the simplest state ownership that fits the requirement.

---

## 15. Rendering

Three.js is presentation.

Do not put business rules into:
- meshes;
- materials;
- render loops;
- scene objects.

Avoid unnecessary allocations inside frame loops.

Dispose resources correctly.

Use instancing/LOD only when justified by measured need.

Measure before optimizing.

---

## 16. UI

Prefer:
- small components;
- explicit props;
- composition;
- predictable state;
- reusable primitives;
- semantic names.

Avoid:
- giant page components;
- duplicated markup;
- hidden side effects;
- magic values;
- duplicated UI logic.

If the same meaningful UI pattern appears twice, consider extracting a component.

---

## 17. Game Design

Never silently introduce a new mechanic.

Before adding one, determine:
1. What player decision does it create?
2. What systems does it interact with?
3. Why is it required now?
4. Is it MVP scope?
5. How will the player understand it?
6. How will it be tested?

If it changes product scope, stop and request a decision.

The player optimizes the system; the player should not become the system's manual operator.

---

## 18. Root Cause First

When something fails:
1. reproduce;
2. inspect evidence;
3. identify root cause;
4. fix root cause;
5. add regression coverage;
6. validate again.

Do not patch symptoms.

Do not add defensive code to hide an unknown problem.

---

## 19. Cleanup

Never delete something merely because it looks unused.

Before deletion verify:
- imports;
- dynamic references;
- package scripts;
- configuration;
- tests;
- asset references;
- build references;
- documentation references.

Classify files:
- confirmed required;
- confirmed obsolete;
- candidate;
- unknown.

Delete only high-confidence obsolete material.

Never delete unknown material automatically.

---

## 20. Dependencies

Before adding a dependency:
1. verify the repository does not already solve the problem;
2. check native/platform functionality;
3. check maintenance and compatibility;
4. consider bundle/runtime cost;
5. justify the dependency.

Do not add dependencies for convenience alone.

---

## 21. Git Safety

Before meaningful work:

    git status --short --branch
    git branch --show-current
    git log -1 --oneline

Never destroy existing user work.

Do not use destructive commands casually.

Never use `git reset --hard` or `git clean -fd` without explicit authorization.

Do not push to `main` unless explicitly requested.

Keep commits focused and coherent.

---

## 22. Documentation

Documentation should explain:
- product decisions;
- architecture;
- important constraints;
- current state;
- important technical decisions.

Do not document every implementation detail.

Create an ADR for significant architectural decisions.

Update `docs/STATE.md` when actual repository state changes materially.

Avoid duplicate rules across documents.

---

## 23. Definition of Done

A meaningful implementation is complete only when:
- behavior is implemented;
- architecture remains coherent;
- important behavior is tested;
- relevant tests pass;
- typecheck passes;
- lint passes;
- build passes;
- E2E/browser validation is performed when relevant;
- visual behavior is checked when relevant;
- no unrelated changes were introduced;
- final diff was reviewed;
- state/documentation was updated when required.

Never claim validation that was not executed.

---

## 24. When to Stop

Stop and request a decision when:
- product requirements conflict;
- documentation conflicts and authority is unclear;
- MVP scope would change;
- a new major system is required;
- persistence compatibility would break;
- a major architecture change is required;
- evidence is insufficient.

Do not guess.

---

## 25. Operating Principle

    Understand
      ↓
    Inspect
      ↓
    Decide
      ↓
    Implement
      ↓
    Test
      ↓
    Validate
      ↓
    Review
      ↓
    Report

Prefer one correct vertical slice over ten incomplete abstractions.

Prefer evidence over assumptions.

Prefer simple architecture over speculative scalability.

Prefer meaningful components over monolithic implementations.

Prefer targeted context over reading the entire repository.

The goal is the right code with minimal wasted context.
