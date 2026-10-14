# Step027 — Performance Profiling

Baseline: `e810258` (Step026). Converts STATE.md's only `UNKNOWN` row
(`Performance`) into measured evidence and fixes one real defect the
measurement exposed. 02-MVP §11: profile before scaling tech.

## 1. Measurements (all executed 2026-10-14)

**Headless simulation** (vitest, `stepSimulation`, 2000 ticks after warmup):

| Scenario | Result |
|---|---|
| D2 colony (23 buildings, pop 10) | **0.061 ms/tick** |
| Heavy (73 buildings, pop 40→2, 48×48 world) | **0.138 ms/tick** |

The 8x tick budget is 62.5 ms/tick — simulation uses ≤ 0.2% of it. The
simulation is not a bottleneck at any MVP-relevant scale (02-MVP §11:
~100 inhabitants, dozens of buildings).

**Browser (headless Chromium, SwiftShader software GL — absolute frame
times are pessimistic; relative comparisons valid):**

| Counter | Before fix | After fix |
|---|---|---|
| geometries after ~120 rebuilds @ 8x | **5704** (grew ~44/update) | **652** (steady, = draw calls) |
| draw calls (scene contents) | 652 | 652 |
| avg update() (mesh rebuild) | 1.6 ms | 1.6 ms |
| frame deltas @ 8x (2s window) | median 25 ms, p95 27.5, max 29 | same (no regression) |

## 2. Defect found and fixed (root cause, not symptom)

`disposeGroup` removed children from the group **before** traversing it,
so `group.traverse` visited an empty group and never disposed any mesh.
Every per-tick rebuild leaked every building/road/deposit geometry and
material: geometries grew ~44 per update without bound (628 → 5704 over
128 updates), while draw calls stayed flat at scene size — a pure GPU
memory leak with no visual symptom. Fix: dispose each child's subtree
before detaching it (`src/renderer/renderer.ts`).

## 3. Instrumentation added

- `Renderer.perfStats()` (new interface method): draw calls, geometries,
  textures, programs, triangles, update count, last/avg update() ms.
- `__nova.perf()` diagnostics entry (docs/DEBUGGING.md §3 surface).
- Permanent E2E regression: "renderer disposes rebuilt meshes: geometry
  count stays flat across ticks" — asserts geometries stay within
  scene-size slack after 20+ rebuilds and avgUpdateMs < 10 ms.

## 4. Decision: full rebuild kept (measured OK)

The per-tick full mesh rebuild stays. Measured cost 1.6 ms/update —
at 8x that is ~26 ms of JS per second (4% of one tick budget), and the
allocation churn is bounded now that disposal works. A rebuild-on-change
diff would add state-diffing complexity without a demonstrated need
(AGENTS.md §15: measure before optimizing; complexity must earn its
place). Revisit only if a future measurement shows frame hitches.

## 5. Validation (all executed 2026-10-14)

- `npx tsc --noEmit`: PASS. `npx eslint .`: PASS.
- `npx vitest run`: PASS — 17 files / 218 tests.
- `npx vite build`: PASS.
- `npx playwright test`: PASS — 15/15 scenarios (14 + 1 new regression).

## 6. Remaining limitations and proposed next step

- Frame numbers come from software GL (SwiftShader); a real-GPU profile
  (draw calls at 100+ buildings) is future validation if the colony
  scales past MVP targets.
- No memory-growth guard beyond the E2E flatness check; long-session
  profiling (30+ min at 8x) remains manual.
- Proposed next: Phase 10 remainder — settings screen (needs product
  decision on which settings) or UI/visual polish passes.
