# NOVA — Engineering Index

## Purpose

This document is the navigation map for engineering documentation.

It prevents the agent from reading every document for every task.

---

## Authority

Use this hierarchy when documents conflict:

1. Explicit current product decision
2. `game/01-PRODUCT-VISION.md`
3. `game/02-MVP.md`
4. `game/03-DESIGN-RULES.md`
5. `game/04-ARCHITECTURE.md`
6. Relevant domain document
7. ADRs (`adr/`)
8. Implementation
9. Tests

`STATE.md` is authoritative for **current repository facts**, not product intent.

---

## Read by Task

### Repository / architecture

Read:
- `../AGENTS.md`
- `STATE.md`
- `game/04-ARCHITECTURE.md`
- relevant ADRs

### Product / gameplay

Read:
- `game/01-PRODUCT-VISION.md`
- `game/02-MVP.md`
- `game/03-DESIGN-RULES.md`
- relevant domain document

### Design coherence / alignment audit

Read:
- `DESIGN-ALIGNMENT.md` (vision reconstructed, real state, gaps P1–P4)
- `GAMEPLAY-TRACEABILITY.md` (intention → code → proof → status, per system)
- `DESIGN-DECISIONS.md` (adopted / rejected / open / experimental / hypotheses)
- `MVP-REFERENCE.md` (the 13 MVP criteria and where the build stands)
- `rebalance/v0.1/REBALANCE-ROADMAP.md` §11–§17 (current ordering, v0.3)

Do not answer "where does the game stand?" from a game/* document alone: those
carry the intent plus an "implemented" section, and the implemented section has
drifted before (corrected 2026-11-20).

### Simulation

Read:
- `game/04-ARCHITECTURE.md`
- `game/05-SIMULATION.md`
- `PERFORMANCE.md`
- relevant ADRs

### World generation

Read:
- `game/06-WORLD.md`
- relevant world ADRs
- `STATE.md`

### Progression

Read:
- `game/07-PROGRESSION.md`
- `game/02-MVP.md`

### Resources / production

Read:
- `game/08-RESOURCES.md`
- `game/05-SIMULATION.md`

### UI / UX

Read:
- `game/09-UI-UX.md`
- `game/03-DESIGN-RULES.md`

### Visual / rendering

Read:
- `game/10-VISUAL-DIRECTION.md`
- `PERFORMANCE.md`
- rendering-related ADRs

### Validation

Read:
- `VALIDATION.md` (levels, escalation, reporting, CI chain)
- `TESTING.md` (coverage catalogue, determinism, save/load, mutation probe)
- `STATE.md` (current counts, durations, gate results)

### Architectural decision

Read:
- `DECISION-PROTOCOL.md`
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

Never assemble Markdown through a double-quoted shell string: backticks in it
are command substitution, and bash replaces each inline command name with its
output — silently, since the write still succeeds. That is how `STATE.md` came
to read `Three gates protect the suite: (109 tests), (41 mutations…)` with
the three commands executed and their names gone (2026-11-14). Edit these files
with the editor tool, or with a script whose shell argument is single-quoted.
After any scripted rewrite of a document, re-read the changed line — a clean
exit status says nothing about the text.

A document that another one replaces moves to `archive/` — never `rm`. The
repository copy of `docs/` is a local mirror and untracked, so deleting a file
here is unrecoverable, while archiving keeps the reasoning without keeping the
rule. `archive/README.md` states the rule; the file keeps its own date and its
replacement says so at the top.
