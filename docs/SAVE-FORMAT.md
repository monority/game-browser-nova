# NOVA — Save Format and Persistence

## 1. Objective

Saves must be deterministic, versioned and resilient to future evolution.

## 2. Save contents

A save should contain only canonical data required to reconstruct the simulation.

Conceptually:

```text
Save
├── formatVersion
├── gameVersion
├── world
│   ├── seed
│   └── configuration
├── simulation
│   ├── time
│   └── speed-independent state
├── entities
├── population
├── economy
├── environment
├── progression
└── settings relevant to simulation
```

Exact schema is an implementation decision.

## 3. Never serialize

Do not serialize:

- Three.js objects;
- WebGL resources;
- React state;
- DOM nodes;
- functions;
- transient animation state;
- cached render objects.

## 4. Versioning

Every persisted format has an explicit version.

Example:

`SAVE_FORMAT_VERSION = 1`

Changing the shape or meaning of persisted data requires a version decision.

## 5. Migration

Prefer explicit migration functions:

```text
v1 → v2 → v3
```

Avoid one giant loader full of historical conditionals.

## 6. Corruption / invalid data

Invalid saves must not silently produce a plausible but incorrect civilization.

The loader should:

1. validate format;
2. identify incompatibility;
3. reject or migrate explicitly;
4. provide an actionable error.

## 7. Deterministic continuation

After loading a valid save, continuing the simulation must preserve deterministic behavior.

## 8. Testing

Required persistence tests:

- current-version round trip;
- migration tests for supported older versions;
- invalid-data rejection;
- deterministic continuation after load.
