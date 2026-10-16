# Step032 — Loop Guard + Load Refresh

Baseline: `74a5314` (audit P0/P2/P3). Principal-excellence pass: two
confirmed defects fixed, both small and covered. No optimization
without measurement (none was justified — sim ≤0.2% of tick budget).

## 1. P1-A: tick exception no longer kills the loop silently

`src/app/loop.ts`: if `onTick()` throws inside a frame, the old code
never reached the `requestAnimationFrame` reschedule — the game froze
with no message and no recovery. Now the frame catches, stops
deliberately (no reschedule), and reports through a new optional
`onError` callback. `src/app/boot.ts` wires it: pause + status line
`Simulation halted: <message>`.

Regression: `tests/loop.test.ts` (2 tests, rAF stubbed) — throwing
tick stops the loop with exactly one error report and no reschedule;
healthy loop ticks at the fixed rate. (Test timing note: `t0` is read
before `start()` captures `last`, so exact-multiple deltas land just
under the step — the helper drives step+100 deltas for exact
single-tick steps.)

## 2. P1-B: load refreshes the UI

`src/app/boot.ts` `onLoad`: `swapState` replaced state + renderer but
never repainted the DOM panels — a colony loaded while paused showed
the previous colony's stats/palette/inspection indefinitely. Now calls
`ui.showInspection(null)` + `refreshStats()` after the swap (same calls
every other command callback makes). Residual, cosmetic: the overlay
toggle highlight can disagree with the fresh renderer's reset overlay
until the next overlay click — self-corrects, noted, not fixed.

## 3. Not changed (deliberately)

- No sim/rendering optimization: nothing measured above budget.
- No three.js upgrade (0.170 → 0.186 available): no reason, real API risk.
- No E2E execution: browsers absent, no documented install path, no
  download authorization. Collection verified (15 tests / 4 files).
- `clampStorage` return stays unconsumed (documented Step031 telemetry
  hook); `console.error("NOVA-DEBUG…")` stays (invariant guard).

## 4. Validation (all executed 2026-10-16)

- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `npx vitest run`: 19 files / 235 tests green (+2 loop).
- `npx vite build`: PASS (app 53kB + three 471kB).
- Playwright: `--list` collects 15/4; execution BLOCKED (no browsers).
