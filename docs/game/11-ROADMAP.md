# NOVA — Implementation Roadmap

## Operating principle

Build in large, coherent vertical slices. Every slice should produce a measurable increase in the playable product.

The agent should not spend weeks building invisible infrastructure before a playable loop exists.

## Phase 0 — Repository foundation

Deliver:

- pnpm project;
- TypeScript strict;
- Vite;
- React;
- Three.js/WebGL2;
- Vitest;
- Playwright;
- lint/typecheck/build;
- deterministic seed utility;
- initial domain/render/application boundaries.

Gate:

A clean project starts, builds, tests and renders a minimal scene.

## Phase 1 — World and camera

Deliver:

- deterministic terrain;
- simple planet/sector presentation;
- starting region;
- city camera;
- pan/zoom/navigation.

Gate:

The player can move from world context into the metropolis.

## Phase 2 — Construction

Deliver:

- building definitions;
- free placement;
- removal;
- roads;
- housing;
- basic costs.

Gate:

The player can create a small city layout.

## Phase 3 — Population and needs

Deliver:

- ~100 starting population;
- housing capacity;
- workforce;
- basic needs;
- satisfaction;
- demographic growth.

Gate:

The city has a functioning population whose state reacts to infrastructure.

## Phase 4 — Production and storage

Deliver:

- resource definitions;
- production buildings;
- inventory;
- warehouses;
- consumption;
- production/consumption balances.

Gate:

The city can produce, store and consume resources.

## Phase 5 — Logistics

Deliver:

- roads as transport network;
- aggregate supply/demand;
- automated distribution;
- capacity;
- distance/congestion effects.

Gate:

The player can improve a real logistics bottleneck and measure the result.

## Phase 6 — Analysis

Deliver:

- contextual inspection;
- drill-down;
- analysis center;
- resource overlays;
- population/needs analysis;
- logistics analysis.

Gate:

A shortage can be diagnosed without the game dictating the solution.

## Phase 7 — Economy and environment

Deliver:

- money;
- public budget;
- income/expenses;
- maintenance;
- pollution;
- environmental quality;
- green spaces.

Gate:

Economic and environmental constraints create real planning trade-offs.

## Phase 8 — Technology and Age 1

Deliver:

- technology model;
- priorities;
- milestones;
- Age 1 completion;
- age transition.

Gate:

A complete Age 1 is playable from start to transition.

## Phase 9 — Beginning of Age 2

Deliver:

- visual transformation;
- new systems/buildings;
- first age-specific optimization problems;
- continuation of the existing city.

Gate:

Age 2 feels materially different without invalidating the old city.

## Phase 10 — MVP hardening

Deliver:

- save/load;
- settings;
- time controls;
- event configuration;
- UI polish;
- visual polish;
- performance profiling;
- E2E full-loop scenario;
- regression suite.

Final gate:

A clean session can complete the entire MVP loop without developer intervention.

## Post-MVP frontier

Only after the core loop is validated:

1. broader resource catalogue;
2. deeper economy and trade;
3. external demand;
4. BOT civilizations;
5. diplomacy;
6. colonies/outposts;
7. colonist expeditions;
8. additional ages;
9. scenarios/challenges;
10. playable factions;
11. advanced warfare.

The order can change based on evidence from the completed MVP.

## Faction note

Playable factions are deliberately deferred. When implemented, they should reuse the same simulation primitives and provide strategic bonuses/maluses rather than separate rule engines.
