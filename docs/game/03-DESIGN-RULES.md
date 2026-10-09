# NOVA — Design Rules

## 1. Core rules

1. The player optimizes; the player does not micromanage.
2. Automatable work is automated.
3. The game exposes causes before prescribing solutions.
4. Complexity comes from interactions, not administrative chores.
5. Production chains stay short unless added complexity creates a meaningful decision.
6. Proximity is normally an optimization, not a hard adjacency requirement.
7. Existing infrastructure remains useful across ages whenever reasonable.
8. New mechanics require a meaningful player decision.
9. New resources require a gameplay justification.
10. New UI must improve understanding.
11. Simulation is the source of truth.
12. Rendering is a presentation layer.
13. Determinism is preferred.
14. Performance work must be measurement-driven.
15. Avoid speculative architecture.
16. Avoid unnecessary abstraction.
17. Do not simulate details that do not produce player value.
18. Visual quality is a product requirement.
19. Nature is a gameplay system, not decoration.
20. The city should communicate its history.
21. Failures must be understandable.
22. Events must not arbitrarily destroy long-term progress.
23. Difficulty must be configurable where appropriate.
24. Sandbox is the initial mode.
25. Future vision does not automatically belong in the MVP.

## 2. Decision test

Before adding a system, answer:

- What decision does the player make?
- What existing system does it interact with?
- How does the player observe it?
- What can the player optimize?
- What is the failure mode?
- What is the minimum implementation that proves its value?
- What is explicitly out of scope?

If these answers are weak, defer the feature.

## 3. Bottleneck philosophy

The player should fight the inefficiency of their system, not the interface.

A bottleneck should be:

- observable;
- explainable;
- actionable;
- measurable after intervention.

## 4. Information philosophy

Bad design:

> Food shortage — build Farm.

Preferred design:

> Food: -140/year
> Fish: -160/year
> Fishery capacity: 75%
> Workforce: 82%
> Transport efficiency: 62%

The game provides evidence. The player chooses the intervention.

## 5. Complexity budget

Every new system consumes complexity in:

- simulation;
- UI;
- content;
- testing;
- save compatibility;
- player learning;
- performance.

A feature must justify that budget.

## 6. No arbitrary punishment

Failure can be severe when it emerges from understandable system conditions.

Examples:

- famine from sustained food shortage;
- economic collapse from unsustainable finances;
- environmental decline from persistent pollution.

The player should be able to trace the chain of causes.

## 7. Historical continuity

Age progression should transform the city without invalidating all previous planning.

The player should be able to look at an old district and understand how it contributed to later development.

## 8. Optimization over clicking

If a player can reasonably define a policy once and let the simulation execute it, the game should prefer that model over repeated manual actions.
