# NOVA — MVP Specification

## 1. Purpose

The MVP is not a miniature version of the entire game. It is the smallest complete product that proves NOVA's defining loop.

## 2. MVP success criterion

A new player must be able to:

1. enter a small functioning colony;
2. identify an initial inefficiency/problem;
3. build and reorganize infrastructure;
4. produce resources;
5. store resources;
6. distribute resources automatically;
7. satisfy population needs;
8. inspect the cause of a shortage or inefficiency;
9. make a meaningful optimization;
10. observe a measurable improvement;
11. develop the population and city;
12. meet civilization milestones;
13. enter the beginning of Age 2.

If this sequence is not enjoyable and understandable, adding more content is the wrong next step.

## 3. Starting condition

The player begins with a small functioning colony, not an empty plot and not a large developed city.

> **Decided (D2, 2026-10-07, Option A):** day-0 = a **10-inhabitant**
> canonical colony (user decision 2026-10-06, confirmed); ~100 inhabitants
> in §4 is the **MVP population scale target**, reached through growth —
> not the starting state. The current code still starts from an empty
> world with a 1-colonist bootstrap gate; migrating the start to the
> 10-inhabitant colony is implementation work, not part of this decision.

The starting situation should contain a solvable problem rather than a crisis. Examples:

- food near its limit;
- weak storage capacity;
- inefficient logistics;
- constrained housing;
- production imbalance.

The player discovers the bottleneck through observation.

## 4. Required MVP systems

### Construction

- free-form building placement;
- removal;
- roads;
- terrain constraints;
- construction cost;
- basic building lifecycle.

### Population

- approximately 100 inhabitants as the MVP scale target (day-0 = 10, see §3);
- housing capacity;
- population growth;
- workforce;
- unemployment/flexible labour;
- basic qualification/education representation.

> **Decided (D4, 2026-10-07):** manual colonist reassignment is deprecated
> as soon as the aggregate population model (Step000 D3) is frozen and
> covers the need. Until then it stays as-is — no UX regression in between.

### Needs

At minimum:

- food;
- water;
- housing;
- one goods category;
- basic services.

### Production

Representative production buildings covering:

- food;
- water;
- materials;
- basic goods.

### Storage

- warehouses;
- resource capacity;
- stock accounting;
- production-to-storage flow.

### Logistics

- road network;
- aggregate flow;
- automated delivery;
- capacity;
- distance/congestion effects.

### Economy

- money;
- public budget;
- income;
- expenditure;
- construction and maintenance costs.

### Environment

- pollution;
- environmental quality;
- green/natural elements.

### Technology and progression

- Age 1;
- milestones;
- a small technology selection;
- beginning of Age 2.

### Analysis

- contextual inspection;
- production/consumption/stock;
- resource drill-down;
- population/needs;
- logistics;
- environment;
- analysis overlays.

### Time

- pause;
- 1×;
- 2×;
- 4×;
- 8×.

### Persistence

- versioned save/load foundation;
- deterministic seed.

## 5. MVP resource set

Use a deliberately compact initial set, for example:

- Cereals;
- Fish;
- Water;
- Wood;
- Stone;
- Basic goods/materials;
- Energy only if required by the selected Age 2 transition;
- Money as the economic medium.

The exact catalogue can change during implementation if the core loop remains intact.

The architecture must allow later expansion to 30–80 resources without rewriting the simulation model.

## 6. MVP building set

The initial catalogue should cover the complete loop, not every future category.

Suggested families:

- housing;
- farm;
- fishery;
- well/water facility;
- wood extraction;
- stone/material extraction;
- workshop/basic processor;
- warehouse;
- market/basic commerce;
- school/basic education;
- health/basic service;
- road;
- green space/tree/natural element.

Exact building count is an implementation detail.

## 7. MVP world

The planet is present visually and can be navigated at a simplified level.

Sectors may expose lightweight data:

- biome;
- resources;
- population/development;
- communities;
- BOT presence;
- strategic value.

The MVP does **not** require a fully simulated global economy or hundreds of active cities.

## 8. MVP progression

Age 1 must be complete.

The beginning of Age 2 must be playable enough to prove that a new age changes both visuals and decisions.

The MVP does not need all future ages.

## 9. MVP UI

The interface must be modern and minimalist rather than a dense sci-fi HUD.

Required information paths:

```text
Category → Resource → Source → Capacity → Workforce → Logistics → District
```

The player should see facts and causes, not a forced solution.

## 10. Explicit exclusions

Do not implement as MVP requirements:

- playable factions;
- advanced diplomacy;
- full BOT civilizations;
- complex warfare;
- colonies at scale;
- colonist expeditions;
- complete global market;
- regional world economy;
- full strategic resources;
- scenarios/challenges;
- multiplayer;
- complete 8–10 age campaign;
- 30–80 resource catalogue;
- individual citizen simulation;
- individual courier simulation;
- complex financial markets;
- advanced world events.

## 11. Performance target

The first implementation should comfortably support the intended MVP workload on the development target.

Initial order of magnitude:

- ~100 inhabitants;
- dozens of buildings;
- meaningful road/logistics networks;
- visible world context;
- time acceleration.

Do not introduce ECS, workers, WASM or sophisticated pathfinding until profiling demonstrates the need.

## 12. MVP acceptance scenario

A representative automated/manual scenario must prove:

```text
Start colony
→ identify food/storage/logistics weakness
→ build or rearrange infrastructure
→ production changes
→ inventory changes
→ automated distribution changes
→ consumption changes
→ satisfaction changes
→ population/economy changes
→ analysis reflects the causal chain
→ player reaches milestone
→ Age 2 begins
```

## 13. Quality bar

MVP is accepted only when:

- core behavior is deterministic;
- important simulation rules are unit tested;
- critical user flow has E2E coverage;
- typecheck/lint/build pass;
- rendering/UI has been manually validated;
- no major architectural boundary is violated;
- the complete loop is playable without developer intervention.
