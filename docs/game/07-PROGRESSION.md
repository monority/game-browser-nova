# NOVA — Progression, Ages and Technology

> **Direction of record:** [`00-GAME-DESIGN-CONTRACT.md`](00-GAME-DESIGN-CONTRACT.md).
> This document owns the values: ages, milestones and technologies. Sections 1–9
> describe the long-term target; **§10 states what the build implements today**.

## 1. Long-term age structure

Target:

- approximately 8–10 major ages;
- sub-ages inside major ages;
- first age shorter;
- later ages progressively longer.

Illustrative future sequence:

1. Primitive
2. Bronze
3. Iron
4. Medieval
5. Renaissance
6. Industrial
7. Modern
8. Digital
9. Futuristic

Names and exact count remain subject to implementation validation. This is a
long-term target, not a commitment: the current build ships **three ages**
(§10.1), and no further age is scheduled.

## 2. Age philosophy

An age is a chapter, not a reskin.

Every age should introduce:

- new problems;
- new systems;
- new optimization opportunities;
- new infrastructure;
- strong visual transformation.

## 3. Milestones

Each age has its own milestone set.

A transition should depend on multiple dimensions rather than one arbitrary number.

Possible dimensions:

- population;
- infrastructure;
- economy;
- production;
- services;
- technology;
- environment;
- strategic development.

## 4. Player agency

Once the conditions are met, the player can force/accelerate the transition where the design calls for it, potentially with a cost.

The player should not wait passively for an invisible timer.

## 5. Technology

Technology is organized as:

```text
Age unlocks
    ↓
Available technology priorities
    ↓
Player-selected development
    ↓
System changes
```

Most technologies should eventually be obtainable.

Some choices create durable specialization.

## 6. Technology design

Prefer effects such as:

- new production method;
- new transport method;
- new resource substitution;
- new building category;
- new logistics capacity;
- new service;
- new energy source;
- new environmental solution.

Avoid making the majority of technology simply “+10% production”.

## 7. Specialization

Long-term specialization occurs at two levels:

- civilization orientation;
- sector/region orientation.

Specialization should shape optimization rather than lock the player into an unrecoverable build.

## 8. Building evolution

Buildings can evolve automatically with age and also receive specific modernization projects.

Historic structures can remain relevant.

## 9. Major projects

Each age can eventually contain several large projects.

Major projects can alter:

- infrastructure capacity;
- energy;
- transport;
- city identity;
- economic capability;
- environmental capability.

## 10. Implemented progression (save v22, corrected 2026-11-20)

Correction du 20/11/2026 : the milestone table and the tech catalogue below had
drifted from the code (they still carried the treasury gates removed by Step070
and a six-entry catalogue). They are restated from `src/content/progression.ts`
and `src/content/techs.ts`; the save version moved from v18 to v22.

The build ships **three ages**: *Age of Founding*, *Age of Expansion*, *Age of
Prosperity* (`AGE_NAMES`). Every milestone of the current age must be met, and
the transition is then **player-triggered** — there is no automatic advance and no
timer.

### 10.1 Milestones

All entries of an age are required; each reads a canonical fact.

| Age | Milestones |
| --- | --- |
| 1 — Founding | population 8; 8 operational buildings; food 30; 3 technologies researched |
| 2 — Expansion | population 15; 14 operational buildings; food 60; 5 technologies researched |
| 3 — Prosperity | population 20; food 75; 30 operational buildings; 20 residences |

What this table is meant to be read as:

- **First form of maturity, not the final expression.** The values were calibrated
  against measured endgames and are kept; improving them later is allowed, a
  redesign is not in flight.
- **Age 2 no longer has a market milestone.** It carried one until the market was
  removed (Step065); the age is back to its four dimensions population /
  buildings / food / technology. Step070 later removed the treasury gate it
  still carried.
- **Age 3 has no technology dimension** (Age 2 already requires 5 of the 8
  technologies) and **no warehouse milestone** (plank-starved endgames cannot
  guarantee one), by deliberate calibration.
- **Age 3 is terminal.** `AGE_MILESTONES` has no entry for age 4, so no transition
  is offered. The command handler increments the age without an explicit guard
  (`applyAdvanceAge`); this is a known technical limit, not a design statement,
  and it is deliberately left unchanged.

### 10.2 Technology catalogue

Eight technologies are shipped (a ninth, `wellShafts`, is kept out of the
catalogue by D1). Each has exactly one additive, system-wide effect, gated by
minimum age. Effects stack within the same family.

| Technology | Cost | Min age | Effect |
| --- | --- | --- | --- |
| Crop Rotation | 50 | 1 | +1 food per staffed farm per tick |
| Masonry | 50 | 1 | +1 stone per staffed quarry per tick |
| Trade Routes | 50 | 1 | +1 money per connected workshop per tick |
| Irrigation | 150 | 2 | +1 food per staffed farm per tick |
| Deep Mining | 150 | 2 | +1 stone per staffed quarry per tick |
| Wheelbarrow | 150 | 2 | +6 cells of free logistics radius |
| Cobbled Roads | 800 | 3 | +6 cells of free logistics radius |
| Winter Wheat | 1200 | 3 | +1 food per staffed farm per tick |

The domain reads these through `techLevel()`; no technology is a flat percentage
bonus on everything, and none introduces a resource of its own. The catalogue is
deliberately small — see the contract (§6.5): technology is a selection with
system effects, not a tree.

Note: a code comment in `src/content/progression.ts` says "all 5 techs are
already required by Age 2". The catalogue has 8 (6 by the end of Age 2); the
statement holds for the milestone (5 of 8). The comment is stale and was not
edited in this pass.

## 11. Deferred factions

Playable factions with unique bonuses/maluses are post-MVP.

The architecture should avoid hard-coding the assumption that all civilizations are identical, but no faction content is required in the first playable build.
