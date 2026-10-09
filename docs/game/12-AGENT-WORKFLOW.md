# NOVA — AI Coding Agent Workflow

## 1. Purpose

NOVA is intended to be developed with an AI coding agent under human product direction.

The agent is an implementation partner, not the product owner.

Markdown files in this repository define the durable contract.

## 2. Required reading before implementation

At the start of every substantial task, read:

1. `README.md`;
2. `01-PRODUCT-VISION.md`;
3. `02-MVP.md`;
4. `03-DESIGN-RULES.md`;
5. `04-ARCHITECTURE.md`;
6. the relevant domain specification;
7. the current roadmap step/task document.

Then inspect the actual repository.

## 3. Repository truth

Never invent:

- files;
- modules;
- tests;
- APIs;
- current behavior;
- branch state;
- previous implementation decisions.

The agent must inspect the repository before proposing implementation.

## 4. Git discipline

Before work:

- inspect `git status`;
- inspect current branch;
- inspect recent commits;
- understand existing uncommitted work.

During work:

- keep changes scoped;
- avoid unrelated cleanup;
- use feature/backup branches as required by project policy;
- do not push to main/protected branches unless explicitly authorized.

## 5. Task format

Every significant implementation task should have:

### Objective
What product outcome is required.

### Existing state
What the repository currently does, based on evidence.

### Requirements
Exact behavior that must exist.

### Non-goals
What must not be implemented in this task.

### Constraints
Architecture, UX, performance and compatibility rules.

### Implementation
The actual code changes.

### Validation
Tests and runtime/browser validation.

### Deliverables
Files, behavior and report.

## 6. Implementation style

Prefer the smallest architecture that solves the real problem.

Avoid:

- speculative frameworks;
- generic abstractions for one use case;
- giant stores;
- premature ECS;
- unnecessary event buses;
- service layers with no independent responsibility;
- excessive configuration;
- duplicated domain state.

## 7. Root-cause policy

For failures:

1. reproduce;
2. inspect the causal path;
3. identify root cause;
4. implement the minimal correct fix;
5. add regression coverage;
6. rerun validation.

Do not mask failures with timeouts, ignored assertions or broad test weakening unless the actual problem is understood and the exception is explicitly justified.

## 8. Validation policy

Do not report a check as passed unless it was actually executed.

Capture exit codes when command output can hide failure.

Typical gates:

- unit tests;
- typecheck;
- lint;
- production build;
- Playwright critical flows;
- browser/manual validation for UI/rendering;
- performance measurements when relevant.

## 9. Browser/visual validation

For UI and 3D changes, automated tests are not sufficient.

Validate:

- layout;
- readability;
- camera behavior;
- placement interaction;
- overlays;
- analysis flows;
- visual artifacts;
- performance regressions visible in the browser.

## 10. Documentation after implementation

A completed step should produce a concise report containing:

- objective;
- actual repository state;
- changes;
- decisions;
- tests executed;
- validation results;
- known limitations;
- commit(s).

Do not write a report that claims more than the evidence supports.

## 11. Product conflict

If the agent discovers a conflict between the requested feature and the product contract:

1. stop before silently redefining the product;
2. state the conflict;
3. identify the smallest compatible interpretation;
4. request/record a product decision if necessary.

## 12. New-system gate

Before introducing a new mechanic, the agent should demonstrate:

- player decision created;
- interaction with existing systems;
- information path;
- measurable consequence;
- MVP relevance;
- implementation cost.

If it is not needed for the current milestone, defer it.

## 13. State of the project

Maintain a small current-state document when needed, but do not duplicate the entire product specification.

Recommended optional files:

```text
docs/
├── roadmap/
│   ├── README.md
│   ├── Step000-baseline-audit.md
│   ├── Step001-<short-name>.md
│   └── ...
└── adr/
    ├── README.md
    ├── ADR-001-<short-name>.md
    └── ...
```

Steps follow the naming and report format defined in `../roadmap/README.md`; ADRs follow `../adr/README.md`.

## 14. Step reports

Step reports should follow:

```text
AUDIT
→ OBSERVATIONS
→ DECISION
→ IMPLEMENTATION
→ VALIDATION
→ RESULT
```

This preserves the evidence-driven workflow used elsewhere in the user's projects.

## 15. Definition of Done

A task is done when:

- the requested behavior exists;
- architecture remains coherent;
- important behavior has regression coverage;
- typecheck/lint/build are clean where applicable;
- critical E2E behavior passes;
- visual behavior has been checked when relevant;
- no unrelated work is included;
- Git state is understood;
- final report accurately describes evidence.

## 16. Human/agent division

Human decides:

- product direction;
- scope;
- trade-offs;
- acceptance;
- whether a new mechanic is justified.

Agent handles:

- repository inspection;
- implementation;
- tests;
- refactoring required by the implementation;
- validation;
- evidence/reporting.

## 17. Core principle

> **Evidence before expansion.**

A working, measurable core loop is worth more than a large unfinished architecture.
