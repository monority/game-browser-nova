# Step015 — Colony Center Food Trickle (D4 completion, terminal lock retired)

Baseline: `2f17d86` (Step014). Completes the audit D4 design ("low-rate
wood **+ food** trickle... the Center's food trickle re-seeds admission
without colonists"): the Colony Center now also produces **+1 food/tick**,
retiring the last structural terminal state (pop 0 + food 0). Date:
2026-10-12.

## DESIGN

- `FOOD_PER_COLONY_CENTER_PER_TICK = 1` — deliberately low-rate: a staffed
  farm (2/tick) always out-produces it, and the trickle alone can never
  sustain growth (housing + farms are still required).
- The anchor is always active — the recovery capability has no escape hatch.
- Consequence at pop 1 without farms: trickle 1 = consumption 1 → exact
  subsistence (the anti-lock). At pop ≥ 2: consumption beats the trickle →
  the colony oscillates in subsistence (0↔1↔2) but is **never permanently
  dead** — the terminal lock is retired.

## IMPLEMENTATION

- `produceFood`: +1 food per operational Colony Center (always active).
- `getResourceSummaries`: the trickle counts in food productionPerTick
  (honest forecast).
- details.ts: Center description updated.
- Persistence unchanged (still SAVE_VERSION 15 — the anchor is already
  persisted).

## VALIDATION (executed 2026-10-12)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 13 files / 156 tests (2 new + 11 retargeted to the trickle), 0 failed |
| G8 | `pnpm build` | PASS |
| G9 | `pnpm test:e2e` | PASS — 12/12 scenarios |
| G10 | per-file diff review | PASS |

Retargeted tests: the trickle changes food arithmetic in 11 assertions
across population/analysis/deactivation/E2E — each updated to the new
contract (e.g. "admission requires food" became "food shortage *delays*
admission; the trickle re-seeds it").

## RESULT

The documented terminal state (pop 0 + food 0 + standing residences) is
recoverable: the trickle re-seeds food → admission resumes. Verified both
at unit level and through the oscillating-subsistence window (max pop ≥ 1
over 12 ticks after total starvation). D4 is now fully implemented.

## DEFERRED

Pollution effects beyond admission, per-cell pollution, renewable wood,
D3 second step (mills/goods), tech/ages.
