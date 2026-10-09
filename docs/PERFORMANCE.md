# NOVA — Performance Rules

## Principle

Performance decisions must be based on measured constraints, not intuition.

Optimize the architecture first; optimize hot paths only when evidence requires it.

---

## Simulation

- Fixed simulation tick.
- Simulation independent from rendering.
- Avoid unnecessary per-tick work.
- Prefer aggregate population and logistics for MVP.
- Avoid accidental O(N²) behavior.
- Keep deterministic behavior.
- Do not add per-entity simulation without a demonstrated need.

---

## Rendering

- Avoid allocations in render loops.
- Avoid unnecessary scene traversal.
- Dispose Three.js resources correctly.
- Avoid unnecessary geometry/material duplication.
- Use instancing when measurement demonstrates a benefit.
- Use LOD when scene complexity requires it.

---

## React

- Keep core simulation state outside React.
- Avoid unnecessary rerenders.
- Prefer derived values over duplicated state.
- Do not add memoization without a reason.
- Avoid passing unstable objects/functions through large component trees without need.

---

## Data

Prefer:
- compact state;
- derived values;
- stable identifiers;
- deterministic generation;
- explicit ownership.

Avoid:
- duplicated canonical state;
- large transient objects;
- repeated serialization;
- unnecessary deep cloning.

---

## Optimization Rule

Before introducing:
- caching;
- workers;
- WASM;
- ECS;
- spatial indexes;
- aggressive memoization;
- complex batching;

identify the measured bottleneck and the expected benefit.

---

## Validation

Performance-sensitive changes should use evidence such as:
- browser profiling;
- frame timing;
- simulation timing;
- memory usage;
- targeted benchmarks.

Do not claim a performance improvement without measurement.
