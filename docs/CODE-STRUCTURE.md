# NOVA — Code Structure

## 1. Objective

Keep the repository understandable as the simulation grows without forcing a premature enterprise architecture.

## 2. Recommended top-level structure

```text
src/
├── domain/
│   ├── simulation/
│   ├── population/
│   ├── economy/
│   ├── logistics/
│   ├── environment/
│   ├── progression/
│   ├── world/
│   └── shared/
├── application/
│   ├── commands/
│   ├── queries/
│   └── services/
├── rendering/
│   ├── scene/
│   ├── entities/
│   ├── camera/
│   └── presentation/
├── ui/
│   ├── components/
│   ├── panels/
│   ├── overlays/
│   └── state/
├── content/
│   ├── buildings/
│   ├── resources/
│   ├── technologies/
│   └── ages/
├── persistence/
├── config/
└── main.tsx

tests/
├── unit/
├── integration/
├── e2e/
└── fixtures/
```

The exact folders may differ if the actual repository has a better established structure. Do not reorganize solely to match this document.

## 3. Dependency direction

Preferred direction:

```text
UI ────────────────┐
Rendering ─────────┤
Application ───────┤
                   ↓
                Domain
                   ↓
              Shared primitives
```

Domain must not depend upward on UI, rendering or application presentation concerns.

## 4. Domain modules

A domain module owns rules for one coherent concept.

Avoid a single `game.ts`, `simulation.ts`, or `utils.ts` becoming a dumping ground.

Do not split files merely to achieve small file sizes.

## 5. Commands and queries

Player actions should enter the simulation through explicit application commands.

Examples:

- `PlaceBuilding`
- `RemoveBuilding`
- `BuildRoad`
- `SetSimulationSpeed`
- `ChooseTechnology`
- `AdvanceAge`

Queries expose read-only information for UI/analysis.

## 6. Content vs rules

Content data should define values such as:

- building costs;
- production recipes;
- resource metadata;
- technology definitions;
- age availability.

Domain code defines behavior and invariants.

Do not encode large catalogues as scattered conditionals.

## 7. Naming

Prefer domain vocabulary over technical jargon.

Good:

- `populationCapacity`
- `foodBalance`
- `storageCapacity`
- `pollutionLevel`
- `productionRate`

Avoid vague names such as:

- `data`
- `thing`
- `manager`
- `helper`
- `processStuff`

## 8. Utilities

A utility is justified when it has a stable, reusable responsibility.

Do not create `utils/` as a dumping ground.

## 9. React

React components should primarily:

- display state;
- collect user intent;
- dispatch commands;
- manage presentation-local state.

They should not calculate the civilization simulation.

## 10. Three.js

Three.js objects are presentation resources.

Never place them in canonical save/simulation state.

## 11. Public APIs

Keep module boundaries explicit.
Avoid exporting internal implementation details unless required.
