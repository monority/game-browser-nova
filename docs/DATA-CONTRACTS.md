# NOVA — Data and Domain Contracts

## 1. Purpose

Define stable boundaries between simulation, content, UI and persistence.

## 2. Canonical state

Canonical state contains facts required to reproduce the simulation.

Examples:

- world seed/configuration;
- simulation time;
- entities and stable IDs;
- buildings;
- roads;
- inventories;
- population aggregates;
- technology state;
- age/progression;
- economy;
- environment.

## 3. Derived state

Derived values can include:

- balances;
- rates;
- summaries;
- analysis metrics;
- overlays.

Derived state should not be persisted unless there is a measured reason.

## 4. Commands

Commands represent player intent.

A command should be validated before changing canonical state.

Examples:

```text
PlaceBuilding
RemoveBuilding
ConstructRoad
SetPriority
ChooseTechnology
SetSimulationSpeed
StartMajorProject
```

## 5. Queries

Queries provide read-only views.

Examples:

```text
GetResourceSummary
GetBuildingInspection
GetPopulationSummary
GetLogisticsAnalysis
GetEnvironmentAnalysis
GetMilestoneStatus
```

## 6. Content definitions

Content should be data-driven where it improves extensibility.

Examples:

```text
BuildingDefinition
ResourceDefinition
NeedDefinition
TechnologyDefinition
AgeDefinition
MilestoneDefinition
```

## 7. Validation

Validate data at boundaries:

- save loading;
- configuration loading;
- content loading;
- external/imported data.

Internal domain functions can rely on validated invariants.

## 8. Invariants

Important invariants should be executable assertions/tests where practical.

Examples:

- population cannot be negative;
- storage capacity cannot be negative;
- entity IDs are unique;
- simulation time is monotonic;
- resource quantities use consistent units;
- age progression cannot skip required milestones unless explicitly designed.

## 9. Versioning

Persisted contracts must be versioned.

A change that affects saved data requires:

- version update;
- migration strategy or explicit incompatibility;
- tests.
