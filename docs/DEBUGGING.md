# NOVA — Debugging and Diagnostics

## 1. Goal

Make simulation failures reproducible and explainable.

## 2. Reproduction identity

A useful reproduction should capture, where possible:

- world seed;
- save/version;
- simulation version;
- simulation time;
- relevant configuration;
- command sequence or user action;
- error/incorrect output.

## 3. Simulation diagnostics

Development builds may expose:

- current tick;
- simulation time;
- population;
- resource balances;
- production totals;
- consumption totals;
- logistics throughput;
- active warnings;
- milestone state.

Diagnostics must not become production gameplay UI by accident.

## 4. Debug overlays

Useful debug views can show:

- building IDs;
- network membership;
- flow quantities;
- pollution values;
- simulation ownership;
- LOD/render state.

## 5. Debugging order

When a visible result is wrong:

1. verify canonical state;
2. verify domain calculation;
3. verify application command/query;
4. verify presentation mapping;
5. verify rendering/UI.

Do not start by patching the visual symptom if the domain state is wrong.

## 6. Logging

Logs should be structured enough to identify the relevant subsystem.

Avoid high-volume logs every simulation tick in normal development.

## 7. Deterministic bugs

Prefer replaying the same seed and command sequence.

A deterministic bug should become a regression test whenever practical.
