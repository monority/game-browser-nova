# NOVA — Product & Engineering Documentation

## Status

**Document set:** MVP foundation
**Audience:** product owner, lead engineer, coding agents, reviewers
**Purpose:** establish a single, versioned contract for building the first playable NOVA.

## What NOVA is

NOVA is a 3D stylized civilization/city-builder in which the player develops a metropolis through historical and technological ages. The civilization is expressed through the evolving city, population, production, logistics, economy, environment and relationship with the wider world.

The player is the director of the civilization, not an individual mayor.

The central fantasy is:

> I understand how my civilization works, I can identify its bottlenecks, I can improve the system, and if I restarted I would build it better.

The design north star is:

> **NOVA est un jeu où tu prends du plaisir à optimiser et non te casser la tête.**

## Source of truth

The owner's intent and decisions live in the project vault at `05-Projects/nova` and are authoritative; these files describe the state of the build and are corrected when they drift from it. The vault does not track build progress — read `docs/MVP-REFERENCE.md` and `docs/REALIGNMENT-PLAN.md` for that. This repository copy is a working mirror and is not Git-tracked. The repository root `AGENTS.md` is the canonical agent contract.

Authority order:

1. Explicit product decisions recorded in the project history/conversation.
2. `01-PRODUCT-VISION.md`.
3. `02-MVP.md`.
4. `03-DESIGN-RULES.md`.
5. `04-ARCHITECTURE.md`.
6. Domain documents.
7. Implementation details.

If implementation conflicts with a higher-level rule, implementation is wrong until the conflict is explicitly resolved.

## Documents

- `01-PRODUCT-VISION.md` — complete product direction.
- `02-MVP.md` — exact first playable scope and exclusions.
- `03-DESIGN-RULES.md` — non-negotiable design principles.
- `04-ARCHITECTURE.md` — technical architecture and boundaries.
- `05-SIMULATION.md` — deterministic simulation model.
- `06-WORLD.md` — planet, sectors and procedural world.
- `07-PROGRESSION.md` — ages, milestones and technology.
- `08-RESOURCES.md` — resources, needs and economy.
- `09-UI-UX.md` — information architecture and analysis.
- `10-VISUAL-DIRECTION.md` — art, rendering and presentation.
- `11-ROADMAP.md` — implementation sequence and gates.
- `12-AGENT-WORKFLOW.md` and `AGENTS.md` — agent workflow and contract, both superseded by the repository root `AGENTS.md` on 2026-11-04 and archived under `../archive/superseded/`.

## MVP north star

The MVP succeeds only if it proves the complete causal loop:

**build → produce → store → distribute → consume → analyse → optimise → develop → milestone → new age**

Content volume is secondary to proving this loop.

## Explicitly deferred

Full diplomacy, complex BOT civilizations, large-scale colonization, advanced warfare, full world economy, many ages, scenarios, challenges, multiplayer and playable factions are post-MVP.

The faction architecture should remain possible, but factions must not inflate the first playable scope.
