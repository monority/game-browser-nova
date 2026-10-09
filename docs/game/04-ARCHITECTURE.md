# NOVA — Technical Architecture

## 1. Goals

The MVP architecture must be:

- deterministic;
- testable;
- simple;
- modular by domain;
- independent of rendering;
- extensible without premature frameworks;
- easy for AI coding agents to inspect.

Recommended stack:

- TypeScript strict;
- React;
- Three.js/WebGL2;
- Vite;
- Vitest;
- Playwright;
- pnpm.

## 2. Architectural layers

```text
                 ┌─────────────────┐
                 │   React UI      │
                 └────────┬────────┘
                          │ selectors / commands
                 ┌────────▼────────┐
                 │ Application      │
                 │ orchestration    │
                 └────────┬────────┘
                          │
                 ┌────────▼────────┐
                 │ Simulation /     │
                 │ Domain State     │
                 └────────┬────────┘
                          │ snapshots
                 ┌────────▼────────┐
                 │ Presentation     │
                 │ / Render Model   │
                 └────────┬────────┘
                          │
                 ┌────────▼────────┐
                 │ Three.js/WebGL2  │
                 └─────────────────┘
```

React and Three.js must not become the domain model.

## 3. Domain boundaries

Suggested conceptual modules:

- `world`;
- `construction`;
- `population`;
- `needs`;
- `resources`;
- `production`;
- `storage`;
- `logistics`;
- `economy`;
- `environment`;
- `technology`;
- `progression`;
- `persistence`.

Exact folder structure is implementation-dependent, but domain ownership must remain clear.

## 4. Simulation independence

Domain code must not import:

- React;
- Three.js;
- DOM APIs;
- browser-specific rendering objects.

This permits deterministic unit tests without a browser.

## 5. Fixed simulation tick

Use a fixed simulation step.

Rendering runs independently.

Conceptually:

```text
simulation time → fixed ticks
render time     → frames
```

Speed controls modify simulation progression, not the rules.

## 6. Commands

Player actions should enter the simulation through explicit commands/actions such as:

- place building;
- remove building;
- build road;
- change priority;
- start research;
- set policy;
- trigger permitted progression.

Avoid arbitrary mutation of canonical state from UI components.

## 7. State ownership

Canonical state should contain facts:

- buildings;
- roads;
- population;
- resource inventories;
- production;
- needs;
- workforce;
- economy;
- environment;
- technologies;
- progression;
- world seed/state.

Do not store Three.js meshes or React component state in the simulation.

## 8. Derived state

Prefer deriving:

- production totals;
- consumption totals;
- satisfaction;
- capacity utilization;
- pollution summaries;
- milestone readiness.

Cache only when profiling demonstrates a need.

## 9. Logistics model

MVP logistics is aggregate.

The simulation should model:

- source supply;
- consumer demand;
- storage;
- network availability;
- capacity;
- distance;
- congestion;
- priority.

It should not require one economic agent per vehicle.

Visible vehicles represent flows rather than define the economic truth.

## 10. Rendering model

Rendering consumes a render/presentation model derived from simulation state.

Recommended future techniques when justified:

- instancing;
- LOD;
- spatial culling;
- batching.

Do not implement a generalized rendering framework before profiling.

## 11. Persistence

Saves contain canonical simulation state and a version.

Never serialize:

- renderer objects;
- meshes;
- materials;
- React state;
- ephemeral UI state;
- unnecessary caches.

Every breaking save change requires explicit migration or a documented compatibility policy.

## 12. Determinism

Same:

- seed;
- initial state;
- simulation version;
- commands;

must produce the same simulation result.

Randomness must be seeded and explicit.

## 13. Validation architecture

Required automated gates:

- typecheck;
- lint;
- unit tests;
- build;
- critical Playwright scenarios.

Rendering changes additionally require browser/manual visual validation.

## 14. Future scaling

Only evidence can justify adding:

- Web Workers;
- WASM;
- ECS;
- advanced spatial indexes;
- multi-level simulation.

The MVP does not need these by default.

## 15. Architecture invariant

> **Simulation is the source of truth; UI and rendering are consumers.**
