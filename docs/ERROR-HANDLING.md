# NOVA — Error Handling and Failure Policy

## 1. Principles

Errors should be:

- explicit;
- diagnosable;
- localized;
- non-destructive;
- safe for persistent data.

## 2. Domain errors

Use explicit domain results/errors for invalid player actions.

Examples:

- insufficient resources;
- invalid placement;
- unavailable technology;
- insufficient housing capacity;
- invalid progression state.

These are not exceptional crashes. They are normal game-state outcomes.

## 3. Programmer errors

Invariant violations and impossible states should be detectable during development.

Do not silently convert them into valid-looking game state.

## 4. Persistence errors

A corrupt or incompatible save must not be loaded as if valid.

Provide a clear failure and preserve the original save where possible.

## 5. Rendering errors

A rendering failure should not corrupt simulation state.

Use fallback presentation where practical.

## 6. Network/external data

MVP should minimize external runtime dependencies.

Future external world/economy data must be treated as untrusted input and validated at the boundary.

## 7. Logging

Do not log sensitive or unnecessary persistent data.

Development diagnostics can be verbose; production logs should be restrained.
