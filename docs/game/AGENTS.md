# NOVA — Agent Engineering Contract

> This file is the mandatory operating contract for AI coding agents working in this repository.

## 1. Mission

Build NOVA as a deterministic, maintainable, testable civilization/city-builder while preserving the product contracts in `01-PRODUCT-VISION.md` and `02-MVP.md`.

The agent is an implementation engineer, not a product owner. Do not silently invent mechanics, alter product decisions, or expand scope.

## 2. Mandatory reading order

Before modifying code:

1. `AGENTS.md`
2. `README.md`
3. `01-PRODUCT-VISION.md`
4. `02-MVP.md`
5. `03-DESIGN-RULES.md`
6. `04-ARCHITECTURE.md`
7. relevant domain documents under `docs/`
8. the current implementation state and tests

If a task references a roadmap step, read that step before implementation.

## 3. Repository truth

Never assume the repository state.

Before implementation inspect:

- current branch;
- `git status`;
- relevant diff;
- project structure;
- package scripts;
- existing tests;
- existing implementation;
- current documentation.

If the working tree contains unrelated changes, preserve them.
Do not reset, clean, stash, amend, or delete unrelated work without explicit authorization.

## 4. Scope control

Implement exactly the requested boundary.

Do not add:

- speculative features;
- future-age systems;
- factions before their planned milestone;
- advanced diplomacy;
- multiplayer;
- complex BOT simulation;
- unnecessary abstractions;
- libraries without a demonstrated need.

If a requested change exposes a necessary architectural issue, fix the smallest root cause required to complete the task.

## 5. Product invariants

Never violate these without an explicit product decision:

- player optimizes rather than micromanages;
- automated logistics are the default;
- the game exposes causes before prescribing solutions;
- complexity comes from system interaction;
- production chains remain reasonably short;
- proximity is generally an optimization, not a mandatory adjacency rule;
- old infrastructure can remain relevant;
- environment and nature are functional systems;
- the city evolves visibly through ages;
- simulation is the source of truth;
- rendering is presentation;
- deterministic simulation is preferred;
- MVP remains sandbox-first.

## 6. Architecture invariants

- Domain/simulation code must not depend on React or Three.js.
- UI must not become the simulation engine.
- Rendering must consume simulation/presentation data.
- Canonical state must not contain Three.js objects or React objects.
- Derived values should be computed from canonical state.
- Randomness must be explicit and seeded.
- Simulation time must be independent from render frame rate.
- Persistence must serialize canonical data only.

## 7. Implementation method

Prefer this sequence:

1. inspect;
2. formulate the root cause/design boundary;
3. identify the smallest coherent implementation;
4. implement domain logic first;
5. connect application/UI/rendering layers;
6. add regression tests;
7. validate;
8. inspect the final diff;
9. report evidence.

Avoid large speculative refactors.

## 8. Tests

Every behavior change must have appropriate tests.

Prioritize pure unit tests for simulation and domain rules.
Use integration tests for cross-system behavior.
Use Playwright for player-visible critical flows.
Use visual/manual validation for rendering and UX changes.

Never weaken or delete a test merely to make a change green.

## 9. Validation claims

Only report commands that were actually executed.
Capture meaningful exit status.
Do not infer success from partial output.

At minimum, run the relevant subset of:

- typecheck;
- lint;
- unit tests;
- integration tests;
- Playwright/E2E;
- production build.

## 10. Git

Keep commits focused.
Do not mix unrelated cleanup with feature work.
Do not push to main/protected branches unless explicitly instructed.

Before commit:

- inspect `git diff`;
- inspect `git status`;
- verify only intended files changed;
- run relevant validation.

## 11. Documentation

Update documentation when implementation changes a durable contract.
Do not create documentation merely to describe trivial implementation details.

Use ADRs for meaningful architectural decisions.
Use step reports for implementation evidence.

## 12. Error handling

Errors must preserve useful context.
Do not silently swallow simulation errors.
Do not use broad `catch` blocks as a substitute for understanding failures.

Invalid external/persistent data must fail safely and visibly.

## 13. Performance

Measure before optimizing.

Do not introduce workers, WASM, ECS, complex spatial indexes, or elaborate caching because they may be useful later.

If performance becomes a problem:

1. reproduce;
2. profile/measure;
3. identify the hotspot;
4. optimize the hotspot;
5. add a regression/performance check where practical.

## 14. Final report

Every substantial implementation task must report:

- what changed;
- why;
- files changed;
- tests added/changed;
- validation commands and actual results;
- known limitations;
- whether any product/architecture decision needs review.

## 15. Stop conditions

Stop and ask for a decision if:

- requirements conflict;
- a requested feature contradicts a product invariant;
- existing behavior is ambiguous and materially affects correctness;
- the implementation would require a major architecture change not covered by the task;
- a destructive repository operation appears necessary.

Do not guess.
