# NOVA — Testing Strategy

## 1. Testing objective

Tests must protect gameplay rules and player-visible behavior, not implementation trivia.

## 2. Test pyramid

```text
              E2E / Playwright
             ─────────────────
              Integration tests
          ─────────────────────────
                 Unit tests
        ─────────────────────────────
```

Most domain behavior belongs in unit tests.

## 3. Unit tests

Test pure/domain behavior:

- production;
- consumption;
- storage;
- logistics calculations;
- needs satisfaction;
- population growth;
- workforce;
- pollution;
- economy;
- milestones;
- technology;
- deterministic world generation.

## 4. Integration tests

Verify interactions between systems.

Examples:

- production → storage → consumption;
- logistics → needs;
- population → workforce → production;
- pollution → environment → quality of life;
- milestone → age transition.

## 5. E2E tests

Protect critical player flows.

Minimum MVP scenario:

1. launch;
2. start deterministic world;
3. place initial buildings;
4. advance time;
5. observe production/consumption;
6. inspect shortage;
7. change infrastructure;
8. observe improvement;
9. reach milestone;
10. enter Age 2.

## 6. Determinism tests

Given identical:

- seed;
- configuration;
- initial state;
- command sequence;

simulation output must match.

If determinism intentionally changes, update the save/version contract and document why.

## 7. Save/load tests

At minimum:

- save current state;
- load it;
- compare canonical state;
- continue simulation;
- verify deterministic continuation.

## 8. Regression tests

Every fixed gameplay bug should receive a regression test when practical.

## 9. Visual validation

Rendering/UI changes require manual or automated browser validation.

Check:

- camera;
- scale;
- readability;
- overlays;
- interaction;
- responsive layout where relevant;
- no console errors.

## 10. Performance validation

Do not use a single arbitrary FPS number as the only criterion.
Measure the relevant workload and compare against a baseline.

Record:

- population;
- building count;
- visible objects;
- simulation speed;
- frame time where relevant.

## 11. Test discipline

Never:

- skip tests silently;
- weaken assertions to make failures disappear;
- mock the entire system under test;
- rely on sleep-based timing when deterministic control is possible.
