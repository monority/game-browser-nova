# NOVA — Rendering Architecture

## 1. Principle

Three.js presents the simulation. It does not own the simulation.

## 2. Render state

The rendering layer consumes a presentation-oriented representation derived from canonical simulation state.

This prevents Three.js implementation details from leaking into gameplay logic.

## 3. Entity lifecycle

For a rendered entity:

```text
Simulation entity
      ↓
Presentation mapping
      ↓
Render object
```

Entity creation/destruction must be deterministic and traceable.

## 4. Instancing

Use instancing where many equivalent objects exist and measurement demonstrates benefit.

Do not prematurely build a custom renderer.

## 5. LOD

LOD should support:

- city zoom levels;
- sector/world view;
- distant infrastructure;
- large populations/vehicles.

LOD must not change gameplay state.

## 6. Camera

The camera supports the long-term hierarchy:

Planet → sector → region → metropolis → district → building.

MVP can implement a reduced subset while preserving the conceptual model.

## 7. Vehicles and inhabitants

Visible people and vehicles are representations of aggregate simulation flows.

Do not require one economically meaningful simulation object per visible agent.

## 8. Rendering errors

A missing model/material should degrade safely.
It must not corrupt simulation state.

## 9. Visual validation

Any significant rendering change must be checked in a real browser context.

Check:

- geometry placement;
- scale;
- lighting;
- camera;
- UI overlap;
- performance;
- console errors.
