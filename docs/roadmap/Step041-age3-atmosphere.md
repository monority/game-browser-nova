# Step041 — Age-3 Atmosphere ("Age of Prosperity" chapter)

Baseline: `c67685d` (Step040). Closes a gap in what Step035/036
shipped: Age 3 was reachable and asserted in the UI, but the renderer
only distinguished `age >= 2` (Step016) — the "Age of Prosperity"
rendered identically to the "Age of Expansion", contradicting the
progression contract ("an age is visibly a chapter",
`docs/game/07-PROGRESSION.md`). No new mechanics — presentation only,
per the existing visual-identity pattern.

## 1. What shipped

**`src/renderer/atmosphere.ts` (new)** — pure per-age palette mapping,
unit-tested:

| Age | Chapter | fog | background | directional |
|---|---|---|---|---|
| 1 Founding | cold night blues | `0x0b0e14` | `0x0b0e14` | `0xfff2df` |
| 2 Expansion | warm ember (Step016, unchanged) | `0x181109` | `0x151009` | `0xffdfb0` |
| 3 Prosperity | radiant gold — brighter, luminous | `0x1e1708` | `0x1a1408` | `0xffe9b4` |

Out-of-range ages clamp to the nearest defined chapter (floor for
fractional/young, ceiling for future ages). The renderer's per-tick
`update` applies the mapping; the ternary block is gone.

**`tests/atmosphere.test.ts` (new, 6 tests)** — Age-1/2 regression
values (the Step016 colors are now pinned, previously only implicit),
Age-3 distinctness (including brighter-than-expansion channel checks),
neighbor distinctness, clamping (0, negative, fractional, > max), purity.

## 2. Validation (all executed 2026-10-20)

- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `npx vitest run`: **21 files / 278 tests** green (+6).
- `npx vite build`: PASS.
- `npx playwright test`: **31/31** (the progression journey drives the
  browser through Age 3 with zero page errors; scene colors are not
  DOM-visible, so the visual claim rests on the unit-pinned mapping —
  the same evidence model as Step016).
