# NOVA — Code Style and Engineering Conventions

## 1. General standard

Code should be boring, explicit and maintainable.

Prefer:

- clear names;
- small cohesive functions;
- explicit data flow;
- strong types;
- deterministic behavior;
- simple control flow.

Avoid cleverness.

## 2. TypeScript

Use strict TypeScript.

Avoid:

- `any` unless unavoidable and documented;
- unchecked casts;
- non-null assertions as a convenience;
- enums when a literal union or data object is clearer;
- mutable global state.

Prefer discriminated unions for finite domain states.

## 3. Immutability

Canonical simulation state should be mutated only through controlled simulation/application operations.

Do not expose mutable internals to arbitrary consumers.

## 4. Numeric values

Define units explicitly.

Examples:

- `populationPerYear`;
- `metersPerSecond`;
- `resourcesPerTick`;
- `moneyPerMonth`.

Do not mix per-tick and per-year values without an explicit conversion.

## 5. IDs

Use stable IDs for persistent domain entities.

Do not use array indexes as persistent identifiers.

## 6. Time

Keep simulation time explicit.
Avoid hidden dependence on wall-clock time.

Tests should be able to advance simulation time deterministically.

## 7. Randomness

Never call an uncontrolled global random source from deterministic simulation code.

Use an explicit seeded RNG/context.

## 8. Functions

Functions should have one clear responsibility.

If a function becomes a large orchestration method, split by domain responsibility rather than arbitrary line count.

## 9. Comments

Comments explain why, invariants, or non-obvious constraints.

Do not comment obvious syntax.

## 10. Error messages

Errors should identify:

- operation;
- relevant entity/ID;
- invalid value/state where safe;
- expected condition where useful.

## 11. Formatting

Follow the repository formatter/linter configuration.
Do not introduce a competing formatting convention.

## 12. Imports

Prefer direct imports.
Avoid circular dependencies.

If circular dependencies appear, reconsider module ownership rather than hiding them with lazy imports.

## 13. Tests as documentation

Test names should describe behavior and expected outcome.

Prefer:

`production_stops_when_required_input_is_unavailable`

over:

`testProduction2`.
