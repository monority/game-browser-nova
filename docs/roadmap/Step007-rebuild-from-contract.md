# Step007 — Rebuild From Documented Contract (through the Step006 slice)

Baseline: empty repository (docs only — no `src/`, no `package.json`, no git
history). The repository was intentionally reset; this step rebuilds the
implementation from the durable contract (`docs/game/`, `docs/adr/`,
roadmap Steps 001–006) as small validated vertical slices P0–P11.
Date: 2026-10-09.

## AUDIT

- Repository contained only documentation (35 documents read in full):
  the product corpus, engineering docs, 6 ADRs, roadmap steps 000–006,
  both audits, TASK.md.
- The documented target state was the Step006 contract: money economy,
  aggregate population, finite wood/stone deposits, Colony Center
  bootstrap, Workshop transformation (2 Wood → 1 Plank), Quarry gated on
  5 Planks, SAVE_VERSION 13.
- No source code existed; the documented historical test counts and the
  SAVE_VERSION 4→12 migration chain belonged to the pre-reset repository.

## DECISIONS (user-confirmed, 2026-10-09)

1. Recreate the Step006 behavior exactly per the docs, built incrementally
   as small vertical slices, each ending with green gates and a commit.
2. Persistence: `SAVE_VERSION 13` only — the historical v4→v12 migration
   chain is NOT rebuilt (no legacy saves exist in this repository).
3. Tests: fresh focused behavior suites per slice (~15–25 tests), not a
   1:1 recreation of the pre-reset 1908-test corpus.
4. UI: plain TypeScript DOM (no React) — matches the pre-reset reality
   where the repo had no React despite the docs' recommendation.
5. pnpm as package manager; git init; one coherent commit per slice.

## IMPLEMENTATION (slices P0–P11, commits a52dc28 → 2f56a2f)

| Slice | Commit | Content |
|---|---|---|
| P0 scaffold | `9fce084` | TS strict + Vite + Vitest + ESLint flat, three dep, minimal DOM app |
| P1 domain core | `a52dc28` | seeded RNG (mulberry32, ADR-005), terrain (explicit + seeded blocked cells), canonical state, resource stock (food 100 / water 0 / money 100 day-0), fixed tick (ADR-002) |
| P2 buildings | `1e0b645` | data-driven catalog (25 money, 2-tick construction), placement validation, roads (5/cell), road network components, construction tick phase |
| P3 population | `788e0fc` | aggregate population (ADR-004), staffing (road access, canonical order, capacity 1, next-tick timing), production +2/tick, all-or-nothing food consumption, water serving, admission gates + bootstrap exemption |
| P4 economy | `e030379` | taxes 1/inhabitant, commerce 2/connected Workshop (staffing-independent), maintenance 1/operational building, revenue-before-commands, D1 net-negative shape reproduced as a test |
| P5 deposits | `f0b41c8` | finite cell-keyed deposits (exhaustion keeps entry), extraction +2/tick adjacent (lowest canonical key drain), Colony Center day-0 anchor (unstaffed 1 wood/tick, maintenance-exempt, bottom-right placement, never player-placed), depositBlocked placement protection |
| P6 transformation | `b54f4a3` | Workshop 2 Wood → 1 Plank/tick staffed, all-or-nothing batch, commerce contract unchanged and separate; Quarry costs 5 Planks (direct stock check, never masked by revenue) |
| P7 persistence | `6a358eb` | SAVE_VERSION 13, config-only world persistence (terrain regenerated from seed), strict boundary validation, 8 rejection cases |
| P8 renderer | `d906347` | Three.js presentation (terrain/roads/deposits/buildings), orbit camera, per-tick scene rebuild, resource disposal, `window.__nova` |
| P9 UI | `617eeb4` | stats panel (money-era surface), palette with plank costs, road drag, hover validity highlight, time controls pause/1×–8×, save/load UI |
| P10 E2E | `2f56a2f` | Playwright: 5 scenarios (smoke + housing + commerce/plank gate + save/load + stat-surface contract); found and fixed a THREE.Object3D.add warning in rebuildGroup |
| P11 docs | this commit | STATE.md rewritten from executed evidence; this report; roadmap pointer; TASK.md |

## VALIDATION (executed 2026-10-09)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 8 files / 91 tests, 0 failed |
| G8 | `pnpm build` (tsc -p tsconfig.build.json && vite build) | PASS |
| G9 | `pnpm test:e2e` (Playwright, chromium) | PASS — 5/5 scenarios |
| G7 visual | dev server + browser inspection at P0/P8/P9 | PASS — canvas renders, UI panels correct, ticks advance at 1× |

## RESULT

The repository is again a working, deterministic NOVA build implementing
the documented Step006 contract: seeded world → construction → staffing →
production/extraction → transformation → consumption → population →
economy → analysis → persistence, with UI and E2E coverage.

Fresh-build fidelity notes (documented simplifications, not silent ones):
- Water coverage is a global stock gate, not per-network coverage.
- No StorageHub (audit D5 consciously parked; no storage capacity mechanics).
- No capability stages (Settlement/Village/Town), tech or ages — PLANNED.
- Test corpus is fresh (91 tests), focused on documented invariants.

## DEFERRED (unchanged from the contract)

D1 economy balancing (next product decision), commerce re-anchoring
(D3/D6, blocked on D1), storage capacity (D5), demolish, fertility/
environment, tech/ages, logistics capacity/congestion, food forecast UI.
