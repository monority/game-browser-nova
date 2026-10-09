# NOVA — Engineering Index

## Purpose

This document is the navigation map for engineering documentation.

It prevents the agent from reading every document for every task.

---

## Authority

Use this hierarchy when documents conflict:

1. Explicit current product decision
2. `01-PRODUCT-VISION.md`
3. `02-MVP.md`
4. `03-DESIGN-RULES.md`
5. `04-ARCHITECTURE.md`
6. Relevant domain document
7. ADRs
8. Implementation
9. Tests

`STATE.md` is authoritative for **current repository facts**, not product intent.

---

## Read by Task

### Repository / architecture

Read:
- `AGENTS.md`
- `STATE.md`
- `04-ARCHITECTURE.md`
- relevant ADRs

### Product / gameplay

Read:
- `01-PRODUCT-VISION.md`
- `02-MVP.md`
- `03-DESIGN-RULES.md`
- relevant domain document

### Simulation

Read:
- `04-ARCHITECTURE.md`
- `05-SIMULATION.md`
- `docs/PERFORMANCE.md`
- relevant ADRs

### World generation

Read:
- `06-WORLD.md`
- relevant world ADRs
- `STATE.md`

### Progression

Read:
- `07-PROGRESSION.md`
- `02-MVP.md`

### Resources / production

Read:
- `08-RESOURCES.md`
- `05-SIMULATION.md`

### UI / UX

Read:
- `09-UI-UX.md`
- `03-DESIGN-RULES.md`

### Visual / rendering

Read:
- `10-VISUAL-DIRECTION.md`
- `docs/PERFORMANCE.md`
- rendering-related ADRs

### Validation

Read:
- `docs/VALIDATION.md`
- `docs/STATE.md`

### Architectural decision

Read:
- `docs/DECISION-PROTOCOL.md`
- relevant ADRs

---

## Token Rule

Never read the complete documentation tree unless explicitly requested.

Start with this index, identify the minimum relevant documents, then read only those.

---

## Documentation Hygiene

Each rule should have one primary home.

If the same rule appears in several documents:
- keep the authoritative version;
- replace duplicates with references;
- do not create conflicting copies.

Update this index when new authoritative documentation categories are introduced.
