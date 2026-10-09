# NOVA — Simulation Specification

## 1. Purpose

This document defines the causal simulation model. It is intentionally independent from UI and rendering.

## 2. Canonical causal chain

```text
Infrastructure
→ Capacity / Services
→ Production
→ Storage
→ Logistics
→ Consumption
→ Needs / Satisfaction
→ Population
→ Workforce
→ Production capacity
→ Economy
→ Environmental pressure
→ Milestones
```

The actual engine can use a different internal decomposition, but it must preserve understandable causality.

## 3. Tick ordering

A practical tick can use:

1. advance simulation time;
2. resolve infrastructure/service availability;
3. calculate production capacity;
4. produce resources;
5. update inventories;
6. resolve logistics/flows;
7. consume resources/services;
8. calculate need satisfaction;
9. update population/workforce;
10. update economy;
11. update environment;
12. resolve controlled events;
13. evaluate milestones;
14. publish derived summaries.

Exact ordering can change when evidence requires it, but changes must be documented because ordering affects determinism.

## 4. Population

Population is aggregate-first.

Minimum state:

- total population;
- housing capacity;
- quality of life;
- workforce capacity;
- employed workforce;
- flexible/unemployed workforce;
- qualification/education level;
- health/longevity representation.

Do not create individual simulation entities unless a later system genuinely requires them.

## 5. Housing

Housing provides capacity.

Population growth depends on:

- available capacity;
- quality of life;
- satisfaction;
- relevant services;
- long-term environmental conditions.

Housing is not just a population counter; it is infrastructure with maintenance and quality.

## 6. Workforce

The player should not assign every citizen.

Flexible labour can automatically fill:

- construction;
- transport;
- general production;
- basic services.

Education/qualification progressively unlocks specialized roles.

## 7. Needs

Needs are category-level outcomes backed by resources/services.

Satisfaction should be continuous or multi-level rather than binary wherever practical.

Illustrative bands:

- 90–100: excellent;
- 70–89: normal;
- 50–69: degraded;
- 25–49: serious;
- 0–24: crisis.

These bands are design guidance, not an immutable formula.

## 8. Production

A producer has, conceptually:

- inputs;
- outputs;
- workforce requirements;
- capacity;
- operating state;
- maintenance;
- pollution/environment impact;
- age/technology availability.

Production must be sensitive to actual constraints.

## 9. Storage

Storage tracks inventory capacity and resource stock.

The game should distinguish:

- produced;
- stored;
- requested;
- delivered;
- consumed;
- lost/wasted where relevant.

This is important for diagnostics.

## 10. Logistics

The MVP does not simulate every courier.

Instead, aggregate flow is influenced by:

- supply;
- demand;
- stock;
- capacity;
- network topology;
- route distance;
- congestion;
- priorities.

A player should be able to improve a flow by changing infrastructure.

## 11. Economy

Track:

- money;
- revenue;
- expenses;
- maintenance;
- construction costs;
- basic prices where needed.

Advanced regional market pricing is a later layer.

## 12. Environment

At minimum:

- pollution stock/pressure;
- environmental quality;
- green/natural coverage;
- ecological pressure.

The environment must interact with city decisions without becoming arbitrary punishment.

## 13. Milestones

Milestones are evaluated from canonical facts.

Each milestone must be explainable to the player:

- what is required;
- current progress;
- what remains.

Avoid opaque XP thresholds.

## 14. Determinism and debugging

The engine should make a problematic simulation reproducible using:

- seed;
- save;
- simulation version;
- tick/time;
- command history where available.

## 15. Testing strategy

High-value tests include:

- production conservation;
- storage capacity;
- consumption;
- shortage propagation;
- logistics flow;
- population growth/decline;
- workforce allocation;
- pollution;
- milestone evaluation;
- save/load round trip;
- deterministic replay.
